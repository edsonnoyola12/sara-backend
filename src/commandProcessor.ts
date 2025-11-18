import { supabaseService } from './supabaseService.js';

export const commandProcessor = {
  async processCommand(phone: string, message: string) {
    const msg = message.toLowerCase().trim();
    
    // Comando: actualizar estatus
    if (msg.includes('actualiza') && msg.includes('a ')) {
      const match = msg.match(/actualiza.*?([a-záéíóúñ\s]+)\s+a\s+(nuevo|contactado|calificado|seguimiento|cerrado|perdido)/i);
      if (match) {
        const leadName = match[1].trim();
        const newStatus = match[2];
        
        const leads = await supabaseService.getLeadByName(leadName);
        if (leads && leads.length > 0) {
          await supabaseService.updateLeadStatus(leads[0].id, newStatus);
          return `✅ Lead "${leadName}" actualizado a: ${newStatus}`;
        }
        return `❌ No encontré el lead "${leadName}"`;
      }
    }

    // Comando: añadir nota
    if (msg.includes('nota') || msg.includes('añade')) {
      const match = msg.match(/(?:nota|añade).*?([a-záéíóúñ\s]+)[:]\s*(.+)/i);
      if (match) {
        const leadName = match[1].trim();
        const note = match[2].trim();
        
        const leads = await supabaseService.getLeadByName(leadName);
        if (leads && leads.length > 0) {
          await supabaseService.addNoteToLead(leads[0].id, note, phone);
          return `📝 Nota agregada a "${leadName}"`;
        }
        return `❌ No encontré el lead "${leadName}"`;
      }
    }

    return null;
  }
};
