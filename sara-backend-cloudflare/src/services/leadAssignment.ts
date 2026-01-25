import { SupabaseService } from './supabase';

export class LeadAssignmentService {
  private supabase: SupabaseService;

  constructor(supabase: SupabaseService) {
    this.supabase = supabase;
  }

  async assignSalesperson(lead: any): Promise<any> {
    const { data: salespeople } = await this.supabase.client
      .from('team_members')
      .select('*')
      .eq('role', 'salesperson')
      .eq('active', true);

    if (!salespeople || salespeople.length === 0) {
      console.error('❌ No hay vendedores disponibles');
      return null;
    }

    // Asignar por especialización
    const propertyType = this.getPropertyType(lead.property_interest);
    let assigned = salespeople.find(s => s.specialization === propertyType);
    
    // Si no hay especialista, round-robin
    if (!assigned) {
      const counts: any = {};
      for (const sp of salespeople) {
        const { count } = await this.supabase.client
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('assigned_to', sp.id)
          .in('status', ['contacted', 'qualified', 'appointment_scheduled']);
        counts[sp.id] = count || 0;
      }
      
      assigned = salespeople.reduce((min, sp) => 
        counts[sp.id] < counts[min.id] ? sp : min
      );
    }

    console.log(`👤 Asignado a: ${assigned.name}`);
    
    await this.supabase.updateLead(lead.id, { assigned_to: assigned.id });
    
    return assigned;
  }

  private getPropertyType(propertyInterest?: string): string {
    if (!propertyInterest) return 'general';
    
    const interest = propertyInterest.toLowerCase();
    
    if (interest.includes('encinos')) return 'premium';
    if (interest.includes('villas') || interest.includes('santa rita')) return 'residential';
    if (interest.includes('terreno')) return 'land';
    
    return 'general';
  }
}
