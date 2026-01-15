import { SupabaseService } from './supabase';

class ResourceServiceClass {
  constructor(private supabase: SupabaseService) {}

  async enviarRecursosDesarrollo(desarrollo: string, phone: string): Promise<void> {
    console.log(`📤 Enviando recursos de ${desarrollo} a ${phone}`);
  }
}

export const resourceService = new ResourceServiceClass(null as any);
