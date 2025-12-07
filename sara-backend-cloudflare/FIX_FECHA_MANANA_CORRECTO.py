with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

old_cita = """      let citaData = null;
      if (timeMatch && dateMatch) {
        let appointmentDate = new Date();
        const dateText = dateMatch[0].toLowerCase();
        
        if (dateText === 'mañana') appointmentDate.setDate(appointmentDate.getDate() + 1);"""

new_cita = """      let citaData = null;
      if (timeMatch && dateMatch) {
        // Usar fecha de México (UTC-6) en lugar de UTC
        const nowMexico = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
        let appointmentDate = new Date(nowMexico);
        const dateText = dateMatch[0].toLowerCase();
        
        console.log('📅 FECHA MÉXICO HOY:', nowMexico.toISOString().split('T')[0]);
        if (dateText === 'mañana') {
          appointmentDate.setDate(appointmentDate.getDate() + 1);
          console.log('📅 FECHA MAÑANA:', appointmentDate.toISOString().split('T')[0]);
        }"""

content = content.replace(old_cita, new_cita)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

print("✅ Fix aplicado: ahora usa timezone de México")
