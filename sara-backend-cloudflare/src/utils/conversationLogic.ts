/**
 * Lógica de conversación extraída para testing
 * CRÍTICO: No modificar sin correr tests
 */

export interface AIAnalysis {
  send_gps?: boolean;
  send_video_desarrollo?: boolean;
  send_contactos?: boolean;
  send_brochure?: boolean;
  send_matterport?: boolean;
  extracted_data?: {
    desarrollo?: string;
    [key: string]: any;
  };
}

export interface ResourceDecision {
  sendOnlyGPS: boolean;
  sendAllResources: boolean;
  skipResources: boolean;
  reason: string;
}

/**
 * Determina si el lead pidió SOLO GPS (ubicación) sin otros recursos
 */
export function shouldSendOnlyGPS(analysis: AIAnalysis): boolean {
  return analysis.send_gps === true && analysis.send_video_desarrollo !== true;
}

/**
 * Determina qué recursos enviar basado en el análisis de IA
 */
export function decideResourceAction(
  analysis: AIAnalysis,
  resourcesAlreadySent: boolean,
  resourcesSentForDev: string | null,
  currentDev: string | null,
  pidioRecursosExplicito: boolean,
  enFlujoCreditoIncompleto: boolean
): ResourceDecision {
  // Si pide SOLO GPS, no enviar recursos completos
  if (shouldSendOnlyGPS(analysis)) {
    return {
      sendOnlyGPS: true,
      sendAllResources: false,
      skipResources: true,
      reason: 'Lead pidió solo ubicación/GPS'
    };
  }

  // Si está en flujo de crédito y no pidió recursos explícitamente
  if (enFlujoCreditoIncompleto && !pidioRecursosExplicito) {
    return {
      sendOnlyGPS: false,
      sendAllResources: false,
      skipResources: true,
      reason: 'En flujo de crédito, no pidió recursos'
    };
  }

  // Si ya se enviaron recursos para este desarrollo
  const devMatch = currentDev && resourcesSentForDev &&
    currentDev.toLowerCase().includes(resourcesSentForDev.toLowerCase());

  if (resourcesAlreadySent && devMatch && !pidioRecursosExplicito) {
    return {
      sendOnlyGPS: false,
      sendAllResources: false,
      skipResources: true,
      reason: 'Recursos ya enviados para este desarrollo'
    };
  }

  // Si pidió video o recursos explícitamente
  if (analysis.send_video_desarrollo === true || pidioRecursosExplicito) {
    return {
      sendOnlyGPS: false,
      sendAllResources: true,
      skipResources: false,
      reason: 'Lead pidió información/video del desarrollo'
    };
  }

  // Default: no enviar nada automáticamente
  return {
    sendOnlyGPS: false,
    sendAllResources: false,
    skipResources: true,
    reason: 'No se detectó petición de recursos'
  };
}

/**
 * Determina si debe incluir GPS dentro de recursos completos
 */
export function shouldIncludeGPSInResources(analysis: AIAnalysis): boolean {
  return analysis.send_gps === true;
}

/**
 * Genera mensaje de GPS según si tiene cita o no
 */
export function generateGPSMessage(
  desarrollo: string,
  gpsLink: string,
  primerNombre: string,
  tieneCita: boolean,
  citaDate?: string,
  citaTime?: string
): string {
  if (tieneCita && citaDate && citaTime) {
    return `📍 *Ubicación de ${desarrollo}:*\n${gpsLink}\n\n` +
      `${primerNombre ? primerNombre + ', recuerda' : 'Recuerda'} que tu cita es el *${citaDate}* a las *${citaTime}* 📅\n¡Ahí te esperamos! 🏠`;
  } else {
    return `📍 *Ubicación de ${desarrollo}:*\n${gpsLink}\n\n` +
      `${primerNombre ? primerNombre + ', ¿te' : '¿Te'} gustaría agendar una visita? 🏠`;
  }
}

// ============ BRIDGE LOGIC ============

export interface BridgeState {
  isActive: boolean;
  leadId?: string;
  leadPhone?: string;
  vendedorId?: string;
  vendedorPhone?: string;
  expiresAt?: string;
}

/**
 * Verifica si un bridge está activo y no expirado
 */
export function isBridgeActive(bridge: BridgeState | null): boolean {
  if (!bridge || !bridge.isActive) return false;
  if (!bridge.expiresAt) return false;

  const now = new Date();
  const expires = new Date(bridge.expiresAt);
  return now < expires;
}

/**
 * Detecta si un mensaje es un comando de bridge
 */
export function isBridgeCommand(message: string): boolean {
  const msgLower = message.toLowerCase().trim();
  const bridgeCommands = [
    'bridge', 'chat', 'hablar', 'contactar',
    'terminar', 'cerrar', 'fin', 'salir'
  ];

  return bridgeCommands.some(cmd => msgLower.startsWith(cmd));
}

/**
 * Determina si un mensaje del vendedor debe reenviarse al lead
 */
export function shouldForwardToLead(
  message: string,
  bridgeActive: boolean
): { forward: boolean; reason: string } {
  if (!bridgeActive) {
    return { forward: false, reason: 'Bridge no activo' };
  }

  if (isBridgeCommand(message)) {
    return { forward: false, reason: 'Es un comando de bridge' };
  }

  return { forward: true, reason: 'Mensaje normal durante bridge activo' };
}
