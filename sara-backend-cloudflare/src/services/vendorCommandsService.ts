import { SupabaseService } from './supabase';
export class VendorCommandsService {
  constructor(private supabase: SupabaseService) {}
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
