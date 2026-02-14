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

    // Preview de segmento
    if (msg.startsWith('preview ') || msg.startsWith('ver ')) {
      return { action: 'call_handler', handlerName: 'previewSegmento' };
    }

    // Eventos
    if (msg === 'eventos' || msg === 'mis eventos' || msg === 'proximos eventos') {
      return { action: 'call_handler', handlerName: 'verEventos' };
    }

    if (msg.startsWith('crear evento ')) {
      return { action: 'call_handler', handlerName: 'crearEvento' };
    }

    if (msg.startsWith('invitar ')) {
      return { action: 'call_handler', handlerName: 'invitarEvento' };
    }

    if (msg.startsWith('registrados')) {
      return { action: 'call_handler', handlerName: 'verRegistrados' };
    }

    // Promociones
    if (msg === 'promociones' || msg === 'promos' || msg === 'mis promos') {
      return { action: 'call_handler', handlerName: 'verPromociones' };
    }

    if (msg.startsWith('crear promo ') || msg.startsWith('nueva promo ')) {
      return { action: 'call_handler', handlerName: 'crearPromocion' };
    }

    if (msg.startsWith('pausar promo ')) {
      return { action: 'call_handler', handlerName: 'pausarPromocion' };
    }

    if (msg.startsWith('activar promo ')) {
      return { action: 'call_handler', handlerName: 'activarPromocion' };
    }

    // Reportes avanzados
    if (msg === 'roi' || msg === 'retorno') {
      return { action: 'call_handler', handlerName: 'agenciaROI' };
    }

    if (msg === 'mejor' || msg === 'mejor campaña' || msg === 'mejor campana') {
      return { action: 'call_handler', handlerName: 'agenciaMejorCampana' };
    }

    if (msg === 'peor' || msg === 'peor campaña' || msg === 'peor campana') {
      return { action: 'call_handler', handlerName: 'agenciaPeorCampana' };
    }

    if (msg === 'gasto' || msg === 'presupuesto') {
      return { action: 'call_handler', handlerName: 'agenciaGasto' };
    }

    if (msg === 'cpl' || msg === 'costo por lead') {
      return { action: 'call_handler', handlerName: 'agenciaCPL' };
    }

    if (msg === 'resumen' || msg === 'dashboard') {
      return { action: 'call_handler', handlerName: 'agenciaResumen' };
    }

    // Fuentes
    if (msg === 'fuentes' || msg === 'sources') {
      return { action: 'call_handler', handlerName: 'agenciaLeads' };
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
      `• *campañas* - Campañas activas\n` +
      `• *metricas* - Métricas del mes\n` +
      `• *leads* / *fuentes* - Leads por fuente\n` +
      `• *resumen* - Dashboard general\n` +
      `• *roi* - Retorno de inversión\n` +
      `• *cpl* - Costo por lead\n` +
      `• *gasto* - Gasto vs presupuesto\n` +
      `• *mejor* / *peor* - Mejor/peor campaña\n\n` +
      `📤 *Envíos:*\n` +
      `• *segmentos* - Ver segmentos\n` +
      `• *preview [segmento]* - Ver leads del segmento\n` +
      `• *broadcast* - Ayuda envío masivo\n` +
      `• *enviar a [segmento]: [msg]* - Enviar\n\n` +
      `🎉 *Eventos:*\n` +
      `• *eventos* - Ver próximos eventos\n` +
      `• *crear evento [datos]* - Crear evento\n` +
      `• *registrados [evento]* - Ver registrados\n\n` +
      `🏷️ *Promociones:*\n` +
      `• *promociones* - Ver promos activas\n` +
      `• *crear promo [datos]* - Crear promoción\n` +
      `• *pausar/activar promo [nombre]* - Control`;
  }
}
