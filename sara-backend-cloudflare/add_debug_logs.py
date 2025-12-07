with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# Agregar logs de debug al inicio del bloque de agendamiento
old_start = '''      // DETECTAR SOLICITUD DE CITA
      const appointmentRequest = /(?:cita|agendar|ver|visitar|mañana|hoy|pasado|lunes|martes|miércoles|jueves|viernes|sábado|domingo)/i.test(body);
      const timePattern = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i;
      const datePattern = /(?:mañana|hoy|pasado|lunes|martes|miércoles|jueves|viernes|sábado|domingo)/i;
      
      if (appointmentRequest && timePattern.test(body) && datePattern.test(body) && matchedProperty) {'''

new_start = '''      // DETECTAR SOLICITUD DE CITA
      const appointmentRequest = /(?:cita|agendar|ver|visitar|mañana|hoy|pasado|lunes|martes|miércoles|jueves|viernes|sábado|domingo)/i.test(body);
      const timePattern = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i;
      const datePattern = /(?:mañana|hoy|pasado|lunes|martes|miércoles|jueves|viernes|sábado|domingo)/i;
      
      console.log('🔍 Detección cita:', {
        appointmentRequest,
        timeTest: timePattern.test(body),
        dateTest: datePattern.test(body),
        hasProperty: !!matchedProperty
      });
      
      if (appointmentRequest && timePattern.test(body) && datePattern.test(body) && matchedProperty) {
        console.log('✅ Iniciando agendamiento...');'''

content = content.replace(old_start, new_start)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Logs de debug agregados")
