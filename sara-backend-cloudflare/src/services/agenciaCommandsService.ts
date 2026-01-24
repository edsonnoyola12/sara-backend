// ═══════════════════════════════════════════════════════════════════════════
// AGENCIA COMMANDS SERVICE - Comandos para Marketing/Agencia
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from './supabase';

interface CommandResult {
  action: 'send_message' | 'call_handler' | 'not_recognized';
  message?: string;
  handlerName?: string;
}

interface HandlerResult {
  message?: string;
  error?: string;
  needsExternalHandler?: boolean;
}

export class AgenciaCommandsService {
  constructor(private supabase: SupabaseService) {}

  detectCommand(mensaje: string, body: string, nombreAgencia: string): CommandResult {
    const msg = mensaje.toLowerCase().trim();

    // Comandos básicos de agencia
    if (msg === 'ayuda' || msg === 'help' || msg === '?') {
      return {
        action: 'send_message',
        message: this.getMensajeAyuda(nombreAgencia)
      };
    }

    if (msg === 'campañas' || msg === 'campaigns' || msg === 'campanas') {
      return { action: 'call_handler', handlerName: 'agenciaCampanas' };
    }

    if (msg === 'metricas' || msg === 'metrics' || msg === 'reporte') {
      return { action: 'call_handler', handlerName: 'agenciaMetricas' };
    }

    if (msg === 'leads' || msg === 'mis leads') {
      return { action: 'call_handler', handlerName: 'agenciaLeads' };
    }

    if (msg.startsWith('enviar a ')) {
      return { action: 'call_handler', handlerName: 'enviarASegmento' };
    }

    if (msg === 'segmentos') {
      return { action: 'call_handler', handlerName: 'verSegmentos' };
    }

    if (msg === 'broadcast') {
      return { action: 'call_handler', handlerName: 'iniciarBroadcast' };
    }

    return {
      action: 'not_recognized',
      message: `No entendí "${mensaje}".\n\nEscribe *ayuda* para ver comandos disponibles.`
    };
  }

  async executeHandler(handlerName: string, nombreAgencia: string): Promise<HandlerResult> {
    // Los handlers principales se ejecutan en whatsapp.ts
    // Este método es para handlers simples que no requieren lógica externa
    return { needsExternalHandler: true };
  }

  private getMensajeAyuda(nombre: string): string {
    return `*COMANDOS AGENCIA/MARKETING*\n${nombre}\n\n` +
      `📊 *Reportes:*\n` +
      `• *campañas* - Ver campañas activas\n` +
      `• *metricas* - Ver métricas y CPL\n` +
      `• *leads* - Ver leads recientes\n\n` +
      `📤 *Envíos:*\n` +
      `• *segmentos* - Ver segmentos disponibles\n` +
      `• *broadcast* - Enviar mensaje masivo\n` +
      `• *enviar a [segmento]: [mensaje]* - Enviar a segmento\n\n` +
      `💡 Ejemplo: enviar a hot: Hola {nombre}, tenemos promoción!`;
  }
}
