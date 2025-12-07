with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# PASO 1: Encontrar y DESACTIVAR notificación inicial al crear lead
# Buscar el bloque que notifica después de crear el lead
old_initial_notification = '''        // Notificar al vendedor asignado
        if (lead.assigned_to && teamMember) {
          await this.twilio.sendMessage(
            teamMember.whatsapp_number,
            `🏠 *NUEVO LEAD*\\n\\nNombre: ${lead.name || 'Pendiente'}\\nTeléfono: ${lead.phone}\\n\\nScore: ${lead.score}/10`
          );
          console.log('🔔 Vendedor notificado');
        }'''

# Lo comentamos completamente
new_initial_notification = '''        // NOTIFICACIÓN MOVIDA - Ahora notificamos solo cuando tengamos datos completos
        // Las notificaciones se envían después de capturar información necesaria'''

content = content.replace(old_initial_notification, new_initial_notification)

# PASO 2: En el bloque donde se crea la hipoteca, agregar notificación al vendedor
# Buscar donde se notifica al asesor y agregar también notificación al vendedor
old_advisor_notification = '''          console.log('🔔 Asesor notificado');
        }'''

new_complete_notification = '''          console.log('🔔 Asesor notificado');
          
          // NOTIFICAR AL VENDEDOR con datos completos
          if (lead.assigned_to) {
            const vendedor = await this.supabase.getTeamMemberById(lead.assigned_to);
            if (vendedor && vendedor.whatsapp_number) {
              await this.twilio.sendMessage(
                vendedor.whatsapp_number,
                `🏠 *LEAD CALIFICADO - CON CRÉDITO*\\n\\nCliente: ${lead.name || 'Sin nombre'}\\nTeléfono: ${lead.phone}\\nPropiedad: ${matchedProperty?.name || 'No especificada'}\\n\\n💰 Datos financieros:\\n• Ingreso: $${mortgageData.monthly_income?.toLocaleString() || 'N/A'}\\n• Deudas: $${mortgageData.current_debt?.toLocaleString() || '0'}\\n• Enganche: $${mortgageData.down_payment?.toLocaleString() || 'N/A'}\\n\\n✅ Lead enviado también a asesor hipotecario`
              );
              console.log('🔔 Vendedor notificado con datos completos');
            }
          }
        }'''

content = content.replace(old_advisor_notification, new_complete_notification)

# PASO 3: Agregar notificación para leads SIN crédito (de contado)
# Después de detectar la propiedad, si NO necesita crédito, notificar
insert_after = '''      await this.supabase.updateLead(lead.id, { property_interest: matchedProperty?.name });
      }'''

notification_no_credit = '''      await this.supabase.updateLead(lead.id, { property_interest: matchedProperty?.name });
      
      // Si NO necesita crédito y ya tenemos nombre + propiedad, notificar vendedor
      const needsCredit = /(?:crédito|hipoteca|financiamiento|asesor)/i.test(body);
      const hasBasicInfo = lead.name && matchedProperty;
      
      if (hasBasicInfo && !needsCredit && lead.assigned_to) {
        const vendedor = await this.supabase.getTeamMemberById(lead.assigned_to);
        if (vendedor && vendedor.whatsapp_number) {
          await this.twilio.sendMessage(
            vendedor.whatsapp_number,
            `🏠 *NUEVO LEAD - DE CONTADO*\\n\\nCliente: ${lead.name}\\nTeléfono: ${lead.phone}\\nPropiedad: ${matchedProperty.name}\\n\\n✅ Cliente comprará de contado (sin crédito)`
          );
          console.log('🔔 Vendedor notificado - Lead de contado');
        }
      }
      }'''

content = content.replace(insert_after, notification_no_credit)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Notificaciones inteligentes implementadas:")
print("  - Notificación inicial desactivada")
print("  - Vendedor notificado solo con datos completos")
print("  - Vendedor notificado si es de contado (sin crédito)")
