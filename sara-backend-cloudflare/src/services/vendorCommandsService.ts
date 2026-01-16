import { SupabaseService } from './supabase';
export class VendorCommandsService {
  constructor(private supabase: SupabaseService) {}

  async getVendedorNotes(vendedorId: string): Promise<{ notes: any; notasVendedor: any }> {
    try {
      const { data: vendedor } = await this.supabase.client
        .from('team_members')
        .select('notes')
        .eq('id', vendedorId)
        .single();

      let notas: any = {};
      if (vendedor?.notes) {
        if (typeof vendedor.notes === 'string') {
          try { notas = JSON.parse(vendedor.notes); } catch (e) { notas = {}; }
        } else if (typeof vendedor.notes === 'object') {
          notas = vendedor.notes;
        }
      }
      return { notes: notas, notasVendedor: notas };
    } catch (e) {
      return { notes: {}, notasVendedor: {} };
    }
  }

  async processVendorMessageInitial(ctx: any): Promise<any> {
    return { handled: false };
  }

  detectEarlyCommand(mensaje: string, body: string): any {
    return null;
  }

  formatBridgeConfirmation(leadName: string): string {
    return `Confirmado para ${leadName}`;
  }

  async savePendingBridgeAppointment(vendedorId: string, notes: any, intencion: any): Promise<void> {
    // Stub
  }

  formatBridgeAppointmentSuggestion(tipo: string, leadName: string, fecha: string, hora: string): string {
    return `Cita sugerida: ${tipo} con ${leadName} el ${fecha} a las ${hora}`;
  }

  async asignarAsesorHipotecario(nombreLead: string, vendedor: any, teamMembers: any[], telefonoLead?: string | null): Promise<any> {
    return { success: false };
  }
  async asignarLeadAVendedor(nombreLead: string, targetVendedor: string): Promise<any> {
    return { success: false };
  }
  async crearYAsignarLead(nombre: string, telefono: string, targetVendedor: string, desarrollo?: string): Promise<any> {
    return { success: false };
  }
}
