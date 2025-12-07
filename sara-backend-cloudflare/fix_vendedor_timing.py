with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Eliminar notificación temprana (después de crear lead)
old_early = '''        for (const v of vendedores) {
          if (v.phone) {
            await this.twilio.sendWhatsAppMessage(
              'whatsapp:' + v.phone, 
              `🆕 Nuevo lead!\\n\\n👤 ${clientName || 'Sin nombre'}\\n📱 ${cleanPhone}\\n🏠 ${matchedProperty?.name || 'Por definir'}\\n⭐ Score: ${lead.score}${assignedVendedor?.id === v.id ? '\\n\\n✅ Asignado a ti' : ''}`
            );
          }
        }
        console.log('🔔 Vendedores notificados:', vendedores.length);'''

new_early = '''        // Notificación al vendedor se envía después de detectar propiedad
        console.log('🔔 Vendedores se notificarán después de procesar mensaje');'''

content = content.replace(old_early, new_early)

# Agregar notificación DESPUÉS de enviar respuesta al cliente (donde ya tenemos nombre y propiedad)
old_after_response = '''      await this.twilio.sendWhatsAppMessage(from, response);

    } catch (error) {'''

new_after_response = '''      await this.twilio.sendWhatsAppMessage(from, response);

      // Notificar vendedores con datos completos
      if (!existingLead) {
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

content = content.replace(old_after_response, new_after_response)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Notificación vendedor movida al final")
