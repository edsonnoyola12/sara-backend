with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# 1. AGREGAR DEBUG para ver qué captura el regex
old_enganche = '''      // ENGANCHE
      const downPaymentMatch = body.match(/(\\d[\\d,\\.]*)\\s*(mil|millones?|millón(?:es)?)?[^\\d]{0,30}(?:de\\s+)?(?:enganche|ahorro)/i);
      if (downPaymentMatch) {
        let amount = parseFloat(downPaymentMatch[1].replace(/,/g, ''));
        const mult = downPaymentMatch[2];
        if (mult && /millón(?:es)?/i.test(mult)) amount *= 1000000;
        else if (mult && /mil/i.test(mult)) amount *= 1000;
        mortgageData.down_payment = amount;
      }'''

new_enganche = '''      // ENGANCHE - Debug mejorado
      const downPaymentMatch = body.match(/(\\d[\\d,\\.]*)\\s*(millones?|millón(?:es)?|mil)?[^\\d]{0,30}(?:de\\s+)?(?:enganche|ahorro)/i);
      if (downPaymentMatch) {
        let amount = parseFloat(downPaymentMatch[1].replace(/,/g, ''));
        const mult = downPaymentMatch[2];
        console.log('🔍 Enganche capturado:', { numero: downPaymentMatch[1], multiplicador: mult, texto: downPaymentMatch[0] });
        
        if (mult && /millón(?:es)?/i.test(mult)) {
          amount *= 1000000;
        } else if (mult && /^mil$/i.test(mult)) {
          amount *= 1000;
        }
        mortgageData.down_payment = amount;
      }'''

content = content.replace(old_enganche, new_enganche)

# 2. MEJORAR NOTIFICACIONES - Incluir TODOS los datos
# Buscar donde se notifica al asesor
old_notif_asesor = '''            await this.twilio.sendWhatsAppMessage(
              'whatsapp:' + assignedAsesor.phone,
              `🏦 Nueva solicitud hipotecaria!\\n\\n👤 ${clientName}\\n📱 ${cleanPhone}\\n🏠 ${matchedProperty.name}\\n💰 Ingreso: $${mortgageData.monthly_income?.toLocaleString()}/mes\\n\\n¡Contactar pronto!`
            );'''

new_notif_asesor = '''            await this.twilio.sendWhatsAppMessage(
              'whatsapp:' + assignedAsesor.phone,
              `🏦 *NUEVA SOLICITUD HIPOTECARIA*\\n\\n👤 Cliente: ${clientName}\\n📱 Teléfono: ${cleanPhone}\\n🏠 Propiedad: ${matchedProperty.name}\\n\\n💰 *DATOS FINANCIEROS:*\\n• Ingreso mensual: $${(mortgageData.monthly_income || 0).toLocaleString()}\\n• Deudas actuales: $${(mortgageData.current_debt || 0).toLocaleString()}\\n• Enganche disponible: $${(mortgageData.down_payment || 0).toLocaleString()}\\n\\n¡Contactar pronto!`
            );'''

content = content.replace(old_notif_asesor, new_notif_asesor)

# Buscar donde se notifica a vendedores sobre crédito
old_notif_vendedor = '''              await this.twilio.sendWhatsAppMessage(
                'whatsapp:' + v.phone,
                `🏦 ${clientName} necesita crédito hipotecario\\n🏠 ${matchedProperty.name}\\nAsesor: ${assignedAsesor?.name || 'Sin asignar'}`
              );'''

new_notif_vendedor = '''              await this.twilio.sendWhatsAppMessage(
                'whatsapp:' + v.phone,
                `🏦 *LEAD CON CRÉDITO*\\n\\n👤 ${clientName}\\n📱 ${cleanPhone}\\n🏠 ${matchedProperty.name}\\n\\n💰 Ingreso: $${(mortgageData.monthly_income || 0).toLocaleString()}\\nDeudas: $${(mortgageData.current_debt || 0).toLocaleString()}\\nEnganche: $${(mortgageData.down_payment || 0).toLocaleString()}\\n\\nAsesor: ${assignedAsesor?.name || 'Sin asignar'}`
              );'''

content = content.replace(old_notif_vendedor, new_notif_vendedor)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ 1. Debug de enganche agregado")
print("✅ 2. Notificaciones mejoradas con datos completos")
print("✅ 3. Orden de multiplicador: millones PRIMERO (más específico)")
