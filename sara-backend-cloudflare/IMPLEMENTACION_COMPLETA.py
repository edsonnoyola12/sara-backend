import re

with open('src/handlers/whatsapp.ts', 'r') as f:
    content = f.read()

# 1. AGREGAR FUNCIÓN PARA VERIFICAR DISPONIBILIDAD
check_availability = '''
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

# Insertar después de la clase WhatsAppHandler
insert_point = content.find('async handleMessage(')
content = content[:insert_point] + check_availability + '\n    ' + content[insert_point:]

print("✅ Funciones de disponibilidad agregadas")

with open('src/handlers/whatsapp.ts', 'w') as f:
    f.write(content)

