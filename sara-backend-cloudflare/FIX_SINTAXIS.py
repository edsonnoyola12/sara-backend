with open('src/handlers/whatsapp.ts', 'r') as f:
    lines = f.readlines()

# Encontrar el último } de la clase (línea 480)
insert_line = 479  # Antes del }

# Funciones a agregar
new_functions = '''
  // Verificar disponibilidad en calendario
  async checkAvailability(startTime: string): Promise<boolean> {
    try {
      const endTime = new Date(new Date(startTime).getTime() + 60*60*1000).toISOString();
      
      const events = await this.calendar.listEvents(startTime, endTime);
      return events.length === 0; // True si está libre
    } catch (err) {
      console.error('Error verificando disponibilidad:', err);
      return true; // Asumir disponible si falla
    }
  }

  // Buscar próximos slots libres
  async findNextAvailableSlots(requestedTime: string, count: number = 3): Promise<string[]> {
    const slots: string[] = [];
    let currentTime = new Date(requestedTime);
    
    while (slots.length < count) {
      const isAvailable = await this.checkAvailability(currentTime.toISOString());
      if (isAvailable) {
        // Verificar horario laboral (9am-6pm)
        const hour = currentTime.getHours();
        if (hour >= 9 && hour < 18) {
          slots.push(currentTime.toISOString());
        }
      }
      currentTime = new Date(currentTime.getTime() + 60*60*1000); // +1 hora
    }
    
    return slots;
  }

'''

# Insertar antes de la línea 480
lines.insert(insert_line, new_functions)

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.writelines(lines)

print("✅ Funciones agregadas correctamente")
