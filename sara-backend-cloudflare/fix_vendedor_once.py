with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Eliminar notificación al final (después de respuesta)
old = '''      await this.twilio.sendWhatsAppMessage(from, response);

      // Notificar vendedores con datos completos
      for (const v of vendedores) {
        if (v.phone) {
          const isAssigned = lead.assigned_to === v.id;
          await this.twilio.sendWhatsAppMessage(
            'whatsapp:' + v.phone,
            `🆕 Nuevo lead!\\n👤 ${clientName}\\n📱 ${cleanPhone}\\n🏠 ${matchedProperty?.name || lead.property_interest || 'Por definir'}\\n⭐ Score: ${newScore}${isAssigned ? '\\n\\n✅ Asignado a ti' : ''}`
          );
        }
      }
      console.log('🔔 Vendedores notificados con datos completos');

    } catch (error) {'''

new = '''      await this.twilio.sendWhatsAppMessage(from, response);

    } catch (error) {'''

content = content.replace(old, new)

# Agregar notificación SOLO al crear lead (descomentar línea 215)
content = content.replace(
    '''        for (const v of vendedores) {
          if (v.phone) {
        // ELIMINADO:             await this.twilio.sendWhatsAppMessage('whatsapp:' + v.phone, '🆕 Nuevo lead!\\nTel: ' + cleanPhone + (assignedVendedor?.id === v.id ? '\\n✅ Asignado a ti' : ''));
          }
        }''',
    '''        for (const v of vendedores) {
          if (v.phone) {
            await this.twilio.sendWhatsAppMessage('whatsapp:' + v.phone, `🆕 Nuevo lead!\\nTel: ${cleanPhone}${assignedVendedor?.id === v.id ? '\\n✅ Asignado a ti' : ''}`);
          }
        }'''
)

# Agregar notificación cuando se asigna asesor
content = content.replace(
    '''          if (assignedAsesor?.phone) {
            await this.twilio.sendWhatsAppMessage(
              'whatsapp:' + assignedAsesor.phone,
              `🏦 Nueva solicitud hipotecaria!\\n\\n👤 ${clientName}\\n📱 ${cleanPhone}\\n🏠 ${matchedProperty?.name || 'Por definir'}\\n💰 Ingreso: $${(mortgageInsert.data?.monthly_income || 0).toLocaleString()}/mes\\n💳 Deudas: $${(mortgageInsert.data?.current_debt || 0).toLocaleString()}\\n🏦 Enganche: $${(mortgageInsert.data?.down_payment || 0).toLocaleString()}\\n\\n¡Contactar pronto!`
            );
          }''',
    '''          if (assignedAsesor?.phone) {
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
)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Notificaciones corregidas")
