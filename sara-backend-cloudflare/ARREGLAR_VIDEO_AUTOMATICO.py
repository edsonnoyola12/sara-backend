with open('src/handlers/whatsapp.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Reemplazar la lógica del video (líneas ~506-530)
old_logic = """      // Video SOLO si NO pidió datos financieros ni cita
      const mencionaFinanciamiento = /(?:crédito|financiamiento|apoyo|gano|ingreso|deuda|enganche)/i.test(body);
      const mencionaCita = /(?:mañana|hoy|lunes|martes|miércoles|jueves|viernes|am|pm|ver)/i.test(body);
      
      if (wantsVideo && matchedProperty && !mencionaFinanciamiento && !mencionaCita) {"""

new_logic = """      // Video automático en PRIMER CONTACTO o si lo pide explícitamente
      const yaEnvioVideo = lead.videos_sent && lead.videos_sent.includes(matchedProperty?.name || '');
      const esPrimerContacto = !lead.name; // Si no tiene nombre, es primer contacto
      const pideVideoExplicitamente = wantsVideo;
      
      if (matchedProperty && !yaEnvioVideo && (esPrimerContacto || pideVideoExplicitamente)) {"""

content = content.replace(old_logic, new_logic)

# Agregar actualización de videos_sent después del fetch
old_fetch = """        fetch(VIDEO_SERVER_URL + '/generate-and-send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientName, propertyName: matchedProperty.name, phone: from })
        }).catch(err => console.error('Error fetch:', err));

        await this.supabase.updateLead(lead.id, { property_interest: matchedProperty.name });
        return;"""

new_fetch = """        fetch(VIDEO_SERVER_URL + '/generate-and-send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientName, propertyName: matchedProperty.name, phone: from })
        }).catch(err => console.error('Error fetch:', err));

        // Marcar video como enviado
        const videosSent = lead.videos_sent || [];
        videosSent.push(matchedProperty.name);
        await this.supabase.updateLead(lead.id, { 
          property_interest: matchedProperty.name,
          videos_sent: videosSent
        });
        return;"""

content = content.replace(old_fetch, new_fetch)

with open('src/handlers/whatsapp.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("✅ Video automático en primer contacto configurado")
print("✅ Control de videos enviados agregado")
