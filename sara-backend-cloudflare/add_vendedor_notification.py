with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Buscar la línea donde se envía mensaje al cliente
# y agregar notificación a vendedores DESPUÉS

old_section = '''      await this.twilio.sendWhatsAppMessage(from, response);

    } catch (error) {'''

new_section = '''      await this.twilio.sendWhatsAppMessage(from, response);

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

content = content.replace(old_section, new_section)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Notificación a vendedores agregada al final")
