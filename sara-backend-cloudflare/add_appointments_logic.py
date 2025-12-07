with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Buscar dónde agregar la lógica (después de detectar propiedades, antes del systemPrompt)
insertion_point = content.find("const catalogoProps = properties.map(p =>")

if insertion_point == -1:
    print("❌ No se encontró el punto de inserción")
    exit(1)

appointments_logic = '''
      // ========================
      // DETECCIÓN DE SOLICITUD DE CITA
      // ========================
      const appointmentKeywords = [
        'cita', 'agendar', 'agenda', 'visita', 'ver la propiedad', 
        'conocer', 'reunión', 'disponibilidad', 'cuándo pueden'
      ];
      const wantsAppointment = appointmentKeywords.some(kw => body.toLowerCase().includes(kw));

      // Detectar fecha/hora mencionada
      const dateTimeMatch = body.match(/(mañana|hoy|pasado|lunes|martes|miércoles|jueves|viernes|sábado|domingo|\\d{1,2}\\/\\d{1,2}|\\d{1,2} de \\w+).*?(\\d{1,2}(?::\\d{2})?\\s*(?:am|pm|hrs)?|\\d{1,2}\\s*(?:de la mañana|tarde|noche))/i);
      
      if (wantsAppointment && dateTimeMatch) {
        console.log('📅 Solicitud de cita detectada:', dateTimeMatch[0]);
        
        // Parsear fecha
        let appointmentDate = new Date();
        const dateStr = dateTimeMatch[1].toLowerCase();
        
        if (dateStr === 'mañana') {
          appointmentDate.setDate(appointmentDate.getDate() + 1);
        } else if (dateStr === 'pasado') {
          appointmentDate.setDate(appointmentDate.getDate() + 2);
        }
        // Agregar más parseo de fechas según necesites
        
        const dateFormatted = appointmentDate.toISOString().split('T')[0];
        
        // Parsear hora
        let hourStr = dateTimeMatch[2].replace(/\\s/g, '');
        let hour = parseInt(hourStr);
        if (hourStr.includes('pm') && hour < 12) hour += 12;
        if (hourStr.includes('am') && hour === 12) hour = 0;
        const timeStr = String(hour).padStart(2, '0') + ':00';
        
        const startTime = `${dateFormatted}T${timeStr}:00-06:00`;
        const endTime = `${dateFormatted}T${String(hour + 1).padStart(2, '0')}:00:00-06:00`;
        
        console.log('🕐 Hora solicitada:', startTime);
        
        // Buscar quién está disponible
        const available = await this.calendar.findAvailableTeam(startTime, endTime, vendedores, asesores);
        
        console.log('✅ Disponibles:', { 
          vendedores: available.vendedores.map(v => v.name),
          asesores: available.asesores.map(a => a.name)
        });
        
        if (available.vendedores.length > 0 || available.asesores.length > 0) {
          // HAY DISPONIBILIDAD
          let response = `✅ Perfecto! Para ${dateStr} a las ${hourStr} tengo disponibles:\\n\\n`;
          
          if (needsMortgage && available.vendedores.length > 0 && available.asesores.length > 0) {
            // Ambos disponibles - PRIORIDAD 1
            response += `👤 ${available.vendedores[0].name} (Vendedor)\\n`;
            response += `🏦 ${available.asesores[0].name} (Asesor Hipotecario)\\n\\n`;
            response += `Podemos ver la propiedad y revisar el crédito en una sola cita. ¿Te parece bien?\\n\\n`;
            response += `Responde "confirmar" para agendar.`;
          } else if (available.vendedores.length > 0) {
            // Solo vendedor
            response += `👤 ${available.vendedores[0].name} (Vendedor)\\n\\n`;
            response += `¿Confirmamos la cita?\\n\\n`;
            response += `Responde "confirmar" para agendar.`;
          } else if (available.asesores.length > 0) {
            // Solo asesor
            response += `🏦 ${available.asesores[0].name} (Asesor Hipotecario)\\n\\n`;
            response += `¿Confirmamos la cita?\\n\\n`;
            response += `Responde "confirmar" para agendar.`;
          }
          
          await this.twilio.sendWhatsAppMessage(from, response);
          
          // Guardar cita pendiente en lead para confirmar después
          await this.supabase.updateLead(lead.id, {
            notes: {
              ...lead.notes,
              pending_appointment: {
                startTime,
                endTime,
                vendedor: available.vendedores[0]?.id || null,
                asesor: available.asesores[0]?.id || null
              }
            }
          });
          
          return; // No continuar con el flujo normal
        } else {
          // NO HAY DISPONIBILIDAD
          // Buscar próximos horarios disponibles
          const tomorrow = new Date(appointmentDate);
          tomorrow.setDate(tomorrow.getDate() + 1);
          const tomorrowStr = tomorrow.toISOString().split('T')[0];
          
          const slots = await this.calendar.getAvailableSlots(tomorrowStr);
          
          let response = `😔 ${dateStr.charAt(0).toUpperCase() + dateStr.slice(1)} a las ${hourStr} no tengo disponibilidad.\\n\\n`;
          
          if (slots.length > 0) {
            response += `Te propongo estos horarios para mañana:\\n\\n`;
            slots.slice(0, 3).forEach(slot => {
              response += `📅 ${slot}\\n`;
            });
            response += `\\n¿Cuál te acomoda mejor?`;
          } else {
            response += `Déjame revisar la agenda y te propongo horarios en un momento.`;
          }
          
          await this.twilio.sendWhatsAppMessage(from, response);
          return;
        }
      }
      
      // CONFIRMAR CITA
      if (/confirmar|confirmo|sí|si|dale|ok/i.test(body) && lead.notes?.pending_appointment) {
        const pending = lead.notes.pending_appointment;
        
        const vendedor = vendedores.find(v => v.id === pending.vendedor);
        const asesor = asesores.find(a => a.id === pending.asesor);
        
        // Crear evento en Google Calendar
        const attendees = [];
        if (vendedor?.email) attendees.push({ email: vendedor.email, name: vendedor.name });
        if (asesor?.email) attendees.push({ email: asesor.email, name: asesor.name });
        
        const summary = `${vendedor?.name || ''}${asesor ? ' + ' + asesor.name : ''} - ${clientName}`;
        const description = `Cliente: ${clientName}\\nTeléfono: ${cleanPhone}\\nPropiedad: ${matchedProperty?.name || 'Por definir'}${needsMortgage ? '\\nNecesita crédito hipotecario' : ''}`;
        
        const calEvent = await this.calendar.createEvent(
          summary,
          description,
          pending.startTime,
          pending.endTime,
          attendees
        );
        
        if (calEvent && calEvent.id) {
          // Guardar en Supabase
          await this.supabase.client.from('appointments').insert([{
            lead_id: lead.id,
            lead_name: clientName,
            lead_phone: cleanPhone,
            vendedor_id: vendedor?.id || null,
            vendedor_name: vendedor?.name || null,
            asesor_id: asesor?.id || null,
            asesor_name: asesor?.name || null,
            property_name: matchedProperty?.name || 'Por definir',
            scheduled_at: pending.startTime,
            google_event_vendedor_id: calEvent.id,
            status: 'confirmed'
          }]);
          
          // Notificar a todos
          await this.twilio.sendWhatsAppMessage(
            from,
            `✅ ¡Cita confirmada!\\n\\n📅 ${new Date(pending.startTime).toLocaleString('es-MX')}\\n👤 ${vendedor?.name || ''}${asesor ? '\\n🏦 ' + asesor.name : ''}\\n\\n¡Te esperamos!`
          );
          
          // Notificar a vendedor
          if (vendedor?.phone) {
            await this.twilio.sendWhatsAppMessage(
              'whatsapp:' + vendedor.phone,
              `📅 Nueva cita confirmada\\n\\n👤 ${clientName}\\n📱 ${cleanPhone}\\n🏠 ${matchedProperty?.name || 'Por definir'}\\n⏰ ${new Date(pending.startTime).toLocaleString('es-MX')}`
            );
          }
          
          // Notificar a asesor
          if (asesor?.phone) {
            await this.twilio.sendWhatsAppMessage(
              'whatsapp:' + asesor.phone,
              `📅 Nueva cita confirmada (crédito)\\n\\n👤 ${clientName}\\n📱 ${cleanPhone}\\n🏠 ${matchedProperty?.name || 'Por definir'}\\n⏰ ${new Date(pending.startTime).toLocaleString('es-MX')}`
            );
          }
          
          // Limpiar pending
          await this.supabase.updateLead(lead.id, {
            notes: { ...lead.notes, pending_appointment: null }
          });
          
          return;
        }
      }
      
      // CANCELAR CITA
      if (/cancelar cita|cancelar|no puedo/i.test(body)) {
        const { data: appointment } = await this.supabase.client
          .from('appointments')
          .select('*')
          .eq('lead_phone', cleanPhone)
          .eq('status', 'confirmed')
          .order('scheduled_at', { ascending: false })
          .limit(1)
          .single();
        
        if (appointment) {
          // Cancelar en Google Calendar
          if (appointment.google_event_vendedor_id) {
            await this.calendar.deleteEvent(appointment.google_event_vendedor_id);
          }
          
          // Actualizar en Supabase
          await this.supabase.client
            .from('appointments')
            .update({ status: 'cancelled', cancelled_by: clientName })
            .eq('id', appointment.id);
          
          await this.twilio.sendWhatsAppMessage(from, '✅ Cita cancelada. Si quieres reagendar, dime cuándo te acomoda.');
          
          // Notificar al equipo
          const vendedor = vendedores.find(v => v.id === appointment.vendedor_id);
          const asesor = asesores.find(a => a.id === appointment.asesor_id);
          
          if (vendedor?.phone) {
            await this.twilio.sendWhatsAppMessage(
              'whatsapp:' + vendedor.phone,
              `❌ ${clientName} canceló la cita del ${new Date(appointment.scheduled_at).toLocaleString('es-MX')}`
            );
          }
          
          if (asesor?.phone) {
            await this.twilio.sendWhatsAppMessage(
              'whatsapp:' + asesor.phone,
              `❌ ${clientName} canceló la cita del ${new Date(appointment.scheduled_at).toLocaleString('es-MX')}`
            );
          }
          
          return;
        }
      }

'''

# Insertar antes de "const catalogoProps"
content = content[:insertion_point] + appointments_logic + content[insertion_point:]

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Lógica de citas agregada")
