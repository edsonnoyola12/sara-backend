import { SupabaseService } from './supabase';
export class AsesorCommandsService {
  constructor(private supabase: SupabaseService) {}
  formatVendedorNoEncontrado(nombre: string, teamMembers: any[]): string {
    return `Vendedor ${nombre} no encontrado`;
  }
}
