with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Buscar el bloque de creación de hipoteca y modificarlo
old_mortgage_check = '''        if (!existingMortgage.data) {
          const assignedAsesor = asesores.length > 0 ? asesores[Math.floor(Math.random() * asesores.length)] : null;

          const mortgageInsert = await this.supabase.client.from('mortgage_applications').insert([{'''

new_mortgage_check = '''        const assignedAsesor = asesores.length > 0 ? asesores[Math.floor(Math.random() * asesores.length)] : null;

        if (!existingMortgage.data) {
          // Crear nueva hipoteca
          const mortgageInsert = await this.supabase.client.from('mortgage_applications').insert([{'''

content = content.replace(old_mortgage_check, new_mortgage_check)

# Agregar lógica de actualización
old_closing = '''          } else {
            console.log('🏦 Solicitud hipotecaria creada:', mortgageInsert.data);
          }

          console.log('🔔 Enviando a asesor:', assignedAsesor?.phone, 'Ingreso:', mortgageInsert.data?.monthly_income);
          if (assignedAsesor?.phone) {'''

new_closing = '''          } else {
            console.log('🏦 Solicitud hipotecaria creada:', mortgageInsert.data);
            
            // Notificar asesor solo si tenemos datos completos
            const hasCompleteData = mortgageInsert.data.monthly_income > 0 && 
                                   mortgageInsert.data.current_debt >= 0 && 
                                   mortgageInsert.data.down_payment >= 0;
            
            if (assignedAsesor?.phone && hasCompleteData) {
              const income = mortgageInsert.data.monthly_income || 0;
              const debt = mortgageInsert.data.current_debt || 0;
              const downPayment = mortgageInsert.data.down_payment || 0;
              const propertyName = mortgageInsert.data.property_name || 'Por definir';
              
              await this.twilio.sendWhatsAppMessage(
                'whatsapp:' + assignedAsesor.phone,
                `🏦 Nueva solicitud hipotecaria!\\n\\n👤 ${clientName}\\n📱 ${cleanPhone}\\n🏠 ${propertyName}\\n💰 Ingreso: $${income.toLocaleString()}/mes\\n💳 Deudas: $${debt.toLocaleString()}\\n🏦 Enganche: $${downPayment.toLocaleString()}\\n\\n¡Contactar pronto!`
              );
              console.log('✅ Asesor notificado con datos completos');
            }
          }
        } else {
          // Actualizar hipoteca existente con nuevos datos
          console.log('🔄 Actualizando hipoteca existente');
          const updateData: any = {};
          
          if (mortgageData.monthly_income) updateData.monthly_income = mortgageData.monthly_income;
          if (mortgageData.current_debt !== undefined) updateData.current_debt = mortgageData.current_debt;
          if (mortgageData.down_payment !== undefined) updateData.down_payment = mortgageData.down_payment;
          if (matchedProperty?.id) {
            updateData.property_id = matchedProperty.id;
            updateData.property_name = matchedProperty.name;
            updateData.requested_amount = matchedProperty.base_price;
          }
          
          const mortgageUpdate = await this.supabase.client
            .from('mortgage_applications')
            .update(updateData)
            .eq('id', existingMortgage.data.id)
            .select()
            .single();
          
          if (mortgageUpdate.data) {
            console.log('✅ Hipoteca actualizada:', mortgageUpdate.data);
            
            // Notificar asesor con datos actualizados si están completos
            const hasCompleteData = mortgageUpdate.data.monthly_income > 0 && 
                                   mortgageUpdate.data.current_debt >= 0 && 
                                   mortgageUpdate.data.down_payment > 0;
            
            if (assignedAsesor?.phone && hasCompleteData) {
              const income = mortgageUpdate.data.monthly_income || 0;
              const debt = mortgageUpdate.data.current_debt || 0;
              const downPayment = mortgageUpdate.data.down_payment || 0;
              const propertyName = mortgageUpdate.data.property_name || 'Por definir';
              
              await this.twilio.sendWhatsAppMessage(
                'whatsapp:' + assignedAsesor.phone,
                `🏦 Solicitud hipotecaria ACTUALIZADA!\\n\\n👤 ${clientName}\\n📱 ${cleanPhone}\\n🏠 ${propertyName}\\n💰 Ingreso: $${income.toLocaleString()}/mes\\n💳 Deudas: $${debt.toLocaleString()}\\n🏦 Enganche: $${downPayment.toLocaleString()}\\n\\n¡Contactar pronto!`
              );
              console.log('✅ Asesor notificado con actualización completa');
            }
          }
        }

        // Eliminar la notificación anterior del asesor
        if (false) {
          console.log('🔔 Enviando a asesor:', assignedAsesor?.phone, 'Ingreso:', 0);
          if (assignedAsesor?.phone) {'''

content = content.replace(old_closing, new_closing)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Paso 2: Lógica de hipoteca actualizada")
