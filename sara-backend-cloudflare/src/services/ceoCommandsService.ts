import { SupabaseService } from './supabase';

export interface CEOCommandResult {
  handled: boolean;
  response?: string;
  action?: string;
  data?: any;
}

export class CEOCommandsService {
  constructor(private supabase: SupabaseService) {}

  detectCommand(mensaje: string): { isCommand: boolean; command?: string; args?: string } {
    const msgLower = mensaje.toLowerCase().trim();

    // Comandos CEO reconocidos
    const commands = [
      'reporte', 'report', 'stats', 'estadisticas',
      'ventas', 'sales', 'pipeline',
      'equipo', 'team', 'vendedores',
      'leads', 'clientes',
      'broadcast', 'enviar',
      'config', 'configurar'
    ];

    for (const cmd of commands) {
      if (msgLower.startsWith(cmd)) {
        const args = mensaje.substring(cmd.length).trim();
        return { isCommand: true, command: cmd, args };
      }
    }

    return { isCommand: false };
  }

  async processCommand(
    comando: string,
    args: string,
    ceoPhone: string,
    sendMessage: (phone: string, message: string) => Promise<any>
  ): Promise<CEOCommandResult> {
    try {
      switch (comando.toLowerCase()) {
        case 'reporte':
        case 'report':
        case 'stats':
        case 'estadisticas':
          return await this.generarReporte(args, ceoPhone, sendMessage);

        case 'ventas':
        case 'sales':
          return await this.reporteVentas(args, ceoPhone, sendMessage);

        case 'equipo':
        case 'team':
          return await this.reporteEquipo(ceoPhone, sendMessage);

        default:
          return { handled: false };
      }
    } catch (e: any) {
      console.error('Error procesando comando CEO:', e);
      return { handled: false, response: `Error: ${e.message}` };
    }
  }

  private async generarReporte(
    tipo: string,
    ceoPhone: string,
    sendMessage: (phone: string, message: string) => Promise<any>
  ): Promise<CEOCommandResult> {
    // Reporte general
    const { data: leads } = await this.supabase.client
      .from('leads')
      .select('id, status, funnel_status, created_at')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    const totalLeads = leads?.length || 0;
    const nuevos = leads?.filter(l => l.funnel_status === 'new').length || 0;
    const contactados = leads?.filter(l => l.funnel_status === 'contacted').length || 0;
    const citados = leads?.filter(l => l.funnel_status === 'scheduled').length || 0;

    const mensaje = `📊 *Reporte Semanal*\n\n` +
      `Total leads: ${totalLeads}\n` +
      `• Nuevos: ${nuevos}\n` +
      `• Contactados: ${contactados}\n` +
      `• Con cita: ${citados}`;

    await sendMessage(ceoPhone, mensaje);
    return { handled: true, action: 'reporte_enviado' };
  }

  private async reporteVentas(
    periodo: string,
    ceoPhone: string,
    sendMessage: (phone: string, message: string) => Promise<any>
  ): Promise<CEOCommandResult> {
    const mensaje = `📈 *Reporte de Ventas*\n\n` +
      `Funcionalidad en desarrollo.\n` +
      `Pronto podrás ver métricas de ventas aquí.`;

    await sendMessage(ceoPhone, mensaje);
    return { handled: true, action: 'reporte_ventas' };
  }

  private async reporteEquipo(
    ceoPhone: string,
    sendMessage: (phone: string, message: string) => Promise<any>
  ): Promise<CEOCommandResult> {
    const { data: team } = await this.supabase.client
      .from('team_members')
      .select('name, role, is_active')
      .eq('is_active', true)
      .order('name');

    let mensaje = `👥 *Equipo Activo*\n\n`;
    for (const member of team || []) {
      mensaje += `• ${member.name} (${member.role || 'vendedor'})\n`;
    }

    await sendMessage(ceoPhone, mensaje);
    return { handled: true, action: 'reporte_equipo' };
  }
}
