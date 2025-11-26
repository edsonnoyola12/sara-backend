import { SupabaseService } from '../services/supabase';
import { TwilioService } from '../services/twilio';
import { CalendarService } from '../services/calendar';
import { DateParser } from '../services/dateParser';
import { OpenAIService } from '../services/openai';

export class CommandHandler {
  private supabase: SupabaseService;
  private twilio: TwilioService;
  private calendar: CalendarService;
  private dateParser: DateParser;

  constructor(supabase: any, twilio: any, calendar: any, ai: OpenAIService) {
    this.supabase = supabase;
    this.twilio = twilio;
    this.calendar = calendar;
    this.dateParser = new DateParser(ai);
  }

  async processCommand(teamMember: any, message: string) {
    const msg = message.toLowerCase().trim();

    if (msg.includes('ver mis leads') || msg.includes('mis leads')) {
      return await this.getMyLeads(teamMember);
    }

    if (msg.includes('buscar ')) {
      const name = message.substring(message.toLowerCase().indexOf('buscar ') + 7).trim();
      return await this.searchLead(name);
    }

    if (msg.includes('actualizar ') && (msg.includes(' a ') || msg.includes(' como '))) {
      return await this.updateLeadStatus(message);
    }

    if (msg.includes('cancelar') && msg.includes('cita')) {
      return await this.cancelAppointment(message);
    }

    if (msg.includes('agendar') || msg.includes('cita')) {
      return await this.scheduleAppointment(message, teamMember);
    }

    return this.showHelp();
  }

  private async getMyLeads(teamMember: any) {
    const { data: leads } = await this.supabase.client
      .from('leads')
      .select('*')
      .eq('assigned_to', teamMember.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (!leads || leads.length === 0) {
      return '📋 No tienes leads asignados aún.';
    }

    let response = `📋 *Tus Leads (${leads.length}):*\n\n`;
    
    leads.forEach((lead: any, idx: number) => {
      const status = this.getStatusEmoji(lead.status);
      response += `${idx + 1}. ${status} *${lead.name || 'Sin nombre'}*\n`;
      response += `   📱 ${lead.phone}\n`;
      if (lead.property_interest) response += `   🏠 ${lead.property_interest}\n`;
      response += `   Estado: ${this.getStatusLabel(lead.status)}\n\n`;
    });

    return response;
  }

  private async searchLead(name: string) {
    const { data: leads } = await this.supabase.client
      .from('leads')
      .select('*')
      .ilike('name', `%${name}%`)
      .limit(5);

    if (!leads || leads.length === 0) {
      return `❌ No encontré leads con el nombre "${name}"`;
    }

    let response = `🔍 *Resultados para "${name}":*\n\n`;
    
    leads.forEach((lead: any, idx: number) => {
      response += `${idx + 1}. *${lead.name || 'Sin nombre'}*\n`;
      response += `   📱 ${lead.phone}\n`;
      response += `   Estado: ${this.getStatusLabel(lead.status)}\n`;
      if (lead.email) response += `   ✉️ ${lead.email}\n`;
      response += `\n`;
    });

    return response;
  }

  private async updateLeadStatus(message: string) {
    const parts = message.toLowerCase().split(/\s+a\s+|\s+como\s+/);
    if (parts.length < 2) {
      return '❌ Formato: "actualizar [nombre] a [nuevo status]"\nStatus válidos: new, contacted, qualified, appointment_scheduled, converted, lost';
    }

    const name = parts[0].replace('actualizar', '').trim();
    const newStatus = parts[1].trim();

    const validStatuses = ['new', 'contacted', 'qualified', 'appointment_scheduled', 'converted', 'lost'];
    if (!validStatuses.includes(newStatus)) {
      return '❌ Status inválido. Usa: new, contacted, qualified, appointment_scheduled, converted, lost';
    }

    const { data: leads } = await this.supabase.client
      .from('leads')
      .select('*')
      .ilike('name', `%${name}%`)
      .limit(1);

    if (!leads || leads.length === 0) {
      return `❌ No encontré un lead con el nombre "${name}"`;
    }

    const lead = leads[0];
    await this.supabase.updateLead(lead.id, { status: newStatus });

    return `✅ Lead actualizado:\n*${lead.name}*\nNuevo estado: ${this.getStatusLabel(newStatus)}`;
  }

  private async cancelAppointment(message: string) {
    console.log('🗑️ Canceling appointment:', message);

    // Extraer solo el nombre, ignorando fechas/horas
    const lowerMsg = message.toLowerCase();
    let rawName = '';
    
    if (lowerMsg.includes('cita de ')) {
      rawName = message.substring(message.toLowerCase().indexOf('cita de ') + 8);
    } else if (lowerMsg.includes('cita con ')) {
      rawName = message.substring(message.toLowerCase().indexOf('cita con ') + 9);
    } else if (lowerMsg.includes('cita para ')) {
      rawName = message.substring(message.toLowerCase().indexOf('cita para ') + 10);
    } else if (lowerMsg.includes('cancelar ')) {
      rawName = message.substring(message.toLowerCase().indexOf('cancelar ') + 9);
    }

    // Limpiar: remover palabras comunes y tomar solo hasta fecha/hora
    const name = rawName
      .replace(/\s*(cita|de|para|con)\s*/gi, '') // Remover estas palabras
      .split(/\s+(a las|el|este|mañana|pasado|hoy|en|de la|am|pm|\d)/i)[0] // Cortar en fecha/hora
      .trim();

    if (!name || name.length < 2) {
      return `❌ Formato: "cancelar cita de [nombre]"

*Ejemplos:*
- cancelar cita de Juan Perez
- cancelar cita para María
- cancelar cita con Carlos`;
    }

    console.log('🔍 Buscando lead:', name);

    // Buscar lead
    const { data: leads } = await this.supabase.client
      .from('leads')
      .select('*')
      .ilike('name', `%${name}%`)
      .limit(1);

    if (!leads || leads.length === 0) {
      return `❌ No encontré un lead con el nombre "${name}"`;
    }

    const lead = leads[0];
    console.log('✅ Lead encontrado:', lead.name);

    // Buscar evento en calendario
    const eventId = await this.calendar.findEventByName(lead.name);
    
    if (!eventId) {
      return `❌ No encontré ninguna cita agendada para ${lead.name}

Puede que ya haya pasado o que nunca se haya agendado.`;
    }

    // Eliminar evento
    const deleted = await this.calendar.deleteEvent(eventId);
    
    if (!deleted) {
      return `❌ Error al cancelar la cita en Google Calendar`;
    }

    // Actualizar status del lead
    await this.supabase.updateLead(lead.id, { 
      status: 'contacted'
    });

    return `✅ *Cita cancelada exitosamente*

👤 Cliente: ${lead.name}
📅 La cita fue eliminada del calendario
📋 Status actualizado a: Contactado

Puedes reagendar cuando quieras.`;
  }

  private async scheduleAppointment(message: string, teamMember: any) {
    console.log('📅 Parsing appointment request:', message);

    const parsed = await this.dateParser.parseDateTime(message);
    
    if (!parsed) {
      return `❌ No pude entender la fecha/hora. 

*Ejemplos válidos:*
- agendar cita para Juan mañana a las 3pm en Los Encinos
- agendar cita con María el viernes a las 11am
- agendar cita para Carlos el 25 de nov a las 4pm para ver la casa del Centro`;
    }

    console.log('✅ Parsed:', parsed);

    const { data: leads } = await this.supabase.client
      .from('leads')
      .select('*')
      .ilike('name', `%${parsed.name}%`)
      .limit(1);

    if (!leads || leads.length === 0) {
      return `❌ No encontré un lead con el nombre "${parsed.name}"\n\nPrimero búscalo con: buscar ${parsed.name}`;
    }

    const lead = leads[0];
    console.log('✅ Lead encontrado:', lead.name);

    let property = parsed.property || lead.property_interest || 'Por definir';
    
    if (parsed.property && parsed.property !== lead.property_interest) {
      console.log('🏠 Actualizando propiedad de interés:', parsed.property);
      await this.supabase.updateLead(lead.id, { 
        property_interest: parsed.property 
      });
      property = parsed.property;
    }

    const [hours, minutes] = parsed.time.split(':');
    const startTime = `${parsed.date}T${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:00-06:00`;
    const endHour = String(parseInt(hours) + 1).padStart(2, '0');
    const endTime = `${parsed.date}T${endHour}:${minutes.padStart(2, '0')}:00-06:00`;

    console.log('📅 Creating calendar event...');
    console.log('🏠 Property:', property);
    
    const event = await this.calendar.createEvent(
      `🏠 ${property} - ${lead.name || 'Cliente'}`,
      `👤 Cliente: ${lead.name}\n📱 ${lead.phone}\n🏠 Propiedad: ${property}\n👨‍💼 Asesor: ${teamMember.name}\n${lead.email ? '✉️ ' + lead.email : ''}`,
      startTime,
      endTime,
      lead.email
    );

    if (!event) {
      console.error('❌ Calendar event creation failed');
      return '❌ Error al crear el evento en Google Calendar. Verifica los logs.';
    }

    console.log('✅ Calendar event created');

    await this.supabase.updateLead(lead.id, { 
      status: 'appointment_scheduled'
    });

    const appointmentDate = new Date(parsed.date + 'T00:00:00-06:00');
    const dateStr = appointmentDate.toLocaleDateString('es-MX', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    return `✅ *Cita agendada exitosamente*

👤 Cliente: ${lead.name}
📱 ${lead.phone}
📅 ${dateStr}
🕐 ${parsed.time} (Hora de México)
🏠 Propiedad: *${property}*
👨‍💼 Asesor: ${teamMember.name}

La propiedad quedó guardada en el perfil del cliente.

🔗 Ver en calendario`;
  }

  private showHelp() {
    return `🤖 *Comandos CRM Disponibles:*

📋 *ver mis leads* - Lista de leads asignados

🔍 *buscar [nombre]* - Buscar un lead

✏️ *actualizar [nombre] a [status]* - Cambiar estado

📅 *agendar cita para [nombre] [fecha] [hora] [propiedad]*
Ejemplos: 
- _agendar cita para Carlos mañana a las 3pm en Los Encinos_

🗑️ *cancelar cita de [nombre]* - Borrar cita agendada
Ejemplos:
- _cancelar cita de Juan Perez_
- _cancelar cita con María_

---
Grupo Santa Rita 🏠`;
  }

  private getStatusEmoji(status: string) {
    const emojis: any = {
      'new': '🆕',
      'contacted': '📞',
      'qualified': '⭐',
      'appointment_scheduled': '📅',
      'converted': '✅',
      'lost': '❌'
    };
    return emojis[status] || '📋';
  }

  private getStatusLabel(status: string) {
    const labels: any = {
      'new': 'Nuevo',
      'contacted': 'Contactado',
      'qualified': 'Calificado',
      'appointment_scheduled': 'Cita agendada',
      'converted': 'Convertido',
      'lost': 'Perdido'
    };
    return labels[status] || status;
  }
}
