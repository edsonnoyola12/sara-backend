/**
 * Maintenance Functions - Bridge verification, followup processing, stagnant leads, anniversaries
 * Extraído de index.ts en Fase 5 de refactorización
 */

import { SupabaseService } from '../services/supabase';
import { MetaWhatsAppService } from '../services/meta-whatsapp';
import { registrarMensajeAutomatico } from './followups';

// ═══════════════════════════════════════════════════════════
// VERIFICAR BRIDGES POR EXPIRAR
// ═══════════════════════════════════════════════════════════
export async function verificarBridgesPorExpirar(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const { data: miembros } = await supabase.client
      .from('team_members')
      .select('id, name, phone, notes')
      .eq('active', true);

    if (!miembros) return;

    const ahora = new Date();
    let advertidos = 0;

    for (const miembro of miembros) {
      if (!miembro.notes || !miembro.phone) continue;

      let notes: any = {};
      try {
        notes = typeof miembro.notes === 'string' ? JSON.parse(miembro.notes) : miembro.notes;
      } catch { continue; }

      const bridge = notes.active_bridge;
      if (!bridge || !bridge.expires_at) continue;

      const expiraEn = new Date(bridge.expires_at);
      const minutosRestantes = (expiraEn.getTime() - ahora.getTime()) / (1000 * 60);

      if (minutosRestantes > 0.5 && minutosRestantes <= 2 && !bridge.warning_sent) {
        const phoneLimpio = miembro.phone.replace(/\D/g, '');
        const leadName = bridge.lead_name || 'el lead';

        // Mensaje al vendedor - incluir comando para extender
        await meta.sendWhatsAppMessage(phoneLimpio,
          '⏰ Por terminar con ' + leadName + '\n\n' +
          '*#mas* = 6 min más\n' +
          '*#cerrar* = terminar'
        );

        // Mensaje al lead - simple, sin tecnicismos
        if (bridge.lead_phone) {
          await meta.sendWhatsAppMessage(bridge.lead_phone,
            '¿Algo más en lo que pueda ayudarte? 🏠'
          );
        }

        notes.active_bridge.warning_sent = true;
        await supabase.client
          .from('team_members')
          .update({ notes })
          .eq('id', miembro.id);

        advertidos++;
        console.log('⏰ Advertencia bridge: ' + miembro.name + ' ↔ ' + leadName);
      }
    }

    console.log(advertidos > 0 ? '🔗 Bridges advertidos: ' + advertidos : '🔗 No hay bridges por expirar');
  } catch (e) {
    console.error('❌ Error verificando bridges:', e);
  }
}

// ═══════════════════════════════════════════════════════════
// PROCESAR FOLLOW-UPS PENDIENTES (cada 2 min)
// Envía automáticamente si pasaron 30 min sin respuesta del vendedor
// ═══════════════════════════════════════════════════════════
export async function procesarFollowupsPendientes(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    const ahora = new Date();

    // Buscar leads con pending_followup que ya expiraron
    const { data: leads } = await supabase.client
      .from('leads')
      .select('id, name, phone, notes, assigned_to, team_members:assigned_to(name)')
      .not('notes->pending_followup', 'is', null);

    if (!leads || leads.length === 0) {
      console.log('📤 No hay follow-ups pendientes');
      return;
    }

    let enviados = 0;
    let saltados = 0;

    for (const lead of leads) {
      const notas = typeof lead.notes === 'object' ? lead.notes : {};
      const pending = (notas as any).pending_followup;

      // Solo procesar si está pendiente
      if (!pending || pending.status !== 'pending') {
        continue;
      }

      // Verificar si ya expiró (30 min desde creación)
      const expiresAt = new Date(pending.expires_at);
      if (ahora < expiresAt) {
        saltados++;
        continue; // Aún no expira, el vendedor tiene tiempo
      }

      // Ya pasaron 30 min sin respuesta del vendedor - enviar automáticamente
      try {
        const phoneLimpio = (pending.lead_phone || lead.phone || '').replace(/\D/g, '');

        if (!phoneLimpio) {
          console.error(`⚠️ Lead ${lead.name} sin teléfono, saltando`);
          continue;
        }

        await meta.sendWhatsAppMessage(phoneLimpio, pending.mensaje);

        // Registrar mensaje automático
        await registrarMensajeAutomatico(supabase, lead.id);

        // Actualizar status
        (notas as any).pending_followup = {
          ...pending,
          status: 'sent_auto',
          sent_at: ahora.toISOString(),
          motivo: 'timeout_30min'
        };
        await supabase.client.from('leads').update({ notes: notas }).eq('id', lead.id);

        enviados++;
        const vendedorNombre = (lead.team_members as any)?.name || 'Sin vendedor';
        console.log(`📤 Follow-up AUTO enviado a ${lead.name} (vendedor ${vendedorNombre} no respondió en 30 min)`);

        // Notificar al vendedor que se envió automático
        const { data: vendedor } = await supabase.client
          .from('team_members')
          .select('phone, name')
          .eq('id', lead.assigned_to)
          .single();

        if (vendedor?.phone) {
          await meta.sendWhatsAppMessage(vendedor.phone.replace(/\D/g, ''),
            `✅ Follow-up enviado automáticamente a *${lead.name}*\n\n(No respondiste en 30 min)`
          );
        }

      } catch (err) {
        console.error(`Error enviando follow-up auto a ${lead.name}:`, err);
      }
    }

    if (enviados > 0 || saltados > 0) {
      console.log(`📤 Follow-ups: ${enviados} enviados auto, ${saltados} esperando aprobación`);
    }

  } catch (e) {
    console.error('Error procesando follow-ups pendientes:', e);
  }
}

// ═══════════════════════════════════════════════════════════
// VERIFICAR LEADS ESTANCADOS
// ═══════════════════════════════════════════════════════════
export async function verificarLeadsEstancados(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  const prioridadStatus: Record<string, number> = {
    'scheduled': 1,
    'contacted': 2,
    'new': 3
  };
  const accionStatus: Record<string, string> = {
    'scheduled': 'pendiente confirmar visita',
    'contacted': 'en espera de respuesta',
    'new': 'sin contactar'
  };

  for (const [status, dias] of Object.entries({ 'scheduled': 2, 'contacted': 3, 'new': 1 })) {
    const fechaLimite = new Date();
    fechaLimite.setDate(fechaLimite.getDate() - dias);

    const { data: leads } = await supabase.client
      .from('leads')
      .select('*, team_members:assigned_to(name, phone)')
      .eq('status', status)
      .lt('updated_at', fechaLimite.toISOString());

    if (!leads || leads.length === 0) continue;

    const porVendedor: Record<string, any[]> = {};
    for (const lead of leads) {
      const vendedor = lead.team_members;
      if (!vendedor?.phone) continue;
      if (!porVendedor[vendedor.phone]) porVendedor[vendedor.phone] = [];
      porVendedor[vendedor.phone].push(lead);
    }

    for (const [phone, leadsVendedor] of Object.entries(porVendedor)) {
      const mensaje = `⚠️ *ALERTA: ${leadsVendedor.length} lead(s) estancado(s)*\n\n` +
        leadsVendedor.slice(0, 5).map((l: any) =>
          `• ${l.name || 'Sin nombre'} - ${accionStatus[status]}`
        ).join('\n') +
        (leadsVendedor.length > 5 ? `\n...y ${leadsVendedor.length - 5} más` : '') +
        `\n\n👆 Actualiza su status en el CRM`;

      await meta.sendWhatsAppMessage(phone, mensaje);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// FELICITACIONES DE ANIVERSARIO DE COMPRA
// Envía mensaje a clientes que cumplen 1, 2, 3... años de haber comprado
// ═══════════════════════════════════════════════════════════════
export async function felicitarAniversarioCompra(supabase: SupabaseService, meta: MetaWhatsAppService): Promise<void> {
  try {
    console.log('🏠 Verificando aniversarios de compra...');

    // Usar timezone de México
    const ahora = new Date();
    const mexicoFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const fechaMexico = mexicoFormatter.format(ahora);
    const [añoHoy, mesStr, diaStr] = fechaMexico.split('-');
    const mesHoy = parseInt(mesStr);
    const diaHoy = parseInt(diaStr);
    console.log(`🏠 Buscando aniversarios para: ${diaHoy}/${mesHoy} (México)`);

    // Buscar leads que compraron (delivered) y cuyo mes/día de status_changed_at coincide con hoy
    const { data: clientesDelivered, error } = await supabase.client
      .from('leads')
      .select('*')
      .eq('status', 'delivered')
      .not('status_changed_at', 'is', null)
      .not('phone', 'is', null);

    console.log(`🏠 DEBUG: error=${JSON.stringify(error)}, clientes=${clientesDelivered?.length || 0}`);
    if (clientesDelivered && clientesDelivered.length > 0) {
      console.log(`🏠 DEBUG: Primer cliente: ${JSON.stringify({ name: clientesDelivered[0].name, phone: clientesDelivered[0].phone, status: clientesDelivered[0].status, status_changed_at: clientesDelivered[0].status_changed_at })}`);
    }

    if (error || !clientesDelivered || clientesDelivered.length === 0) {
      console.log('🏠 No hay clientes con status delivered');
      return;
    }

    // Filtrar los que cumplen aniversario hoy (usando timezone México)
    const aniversariosHoy = clientesDelivered.filter((cliente: any) => {
      if (!cliente.status_changed_at) return false;
      // Convertir fecha de compra a timezone México
      const fechaCompra = new Date(cliente.status_changed_at);
      const compraEnMexico = mexicoFormatter.format(fechaCompra);
      const [añoCompraStr, mesCompraStr, diaCompraStr] = compraEnMexico.split('-');
      const mesCompra = parseInt(mesCompraStr);
      const diaCompra = parseInt(diaCompraStr);
      const añoCompra = parseInt(añoCompraStr);
      const añosTranscurridos = parseInt(añoHoy) - añoCompra;

      // Solo si es aniversario (mismo día/mes) y ya pasó al menos 1 año
      return mesCompra === mesHoy && diaCompra === diaHoy && añosTranscurridos >= 1;
    });

    if (aniversariosHoy.length === 0) {
      console.log('🏠 No hay aniversarios de compra hoy');
      return;
    }

    console.log(`🏠 Encontrados ${aniversariosHoy.length} aniversarios de compra hoy`);

    // Cargar vendedores por si el join falló
    const { data: teamMembers } = await supabase.client
      .from('team_members')
      .select('id, name, phone')
      .eq('active', true);

    let felicitados = 0;
    const aniversariosPorVendedor = new Map<string, any[]>();

    for (const cliente of aniversariosHoy) {
      if (!cliente.phone) continue;

      // Calcular años transcurridos
      const fechaCompra = new Date(cliente.status_changed_at);
      const compraEnMexico = mexicoFormatter.format(fechaCompra);
      const añoCompraNum = parseInt(compraEnMexico.split('-')[0]);
      const años = parseInt(añoHoy) - añoCompraNum;

      // Verificar si ya felicitamos este año (revisar notes)
      const notes = cliente.notes || '';
      const añoActual = parseInt(añoHoy);
      if (typeof notes === 'string' && notes.includes(`Aniversario ${añoActual}`)) {
        console.log(`⏭️ ${cliente.name} ya felicitado este año`);
        continue;
      }
      if (typeof notes === 'object' && JSON.stringify(notes).includes(`Aniversario ${añoActual}`)) {
        console.log(`⏭️ ${cliente.name} ya felicitado este año`);
        continue;
      }

      const nombre = cliente.name?.split(' ')[0] || 'vecino';
      const añoTexto = años === 1 ? 'un año' : `${años} años`;
      const desarrollo = cliente.property_interest || 'Santa Rita';

      // Mensaje personalizado según el año
      let mensaje = '';
      if (años === 1) {
        mensaje = `🏠🎉 *¡Feliz primer aniversario en tu hogar, ${nombre}!*

Hace exactamente un año comenzaste esta nueva etapa en *${desarrollo}*.

Esperamos que este tiempo haya sido lleno de momentos increíbles. ¡Gracias por ser parte de nuestra comunidad!

¿Cómo te ha ido? Nos encantaría saber de ti 😊`;
      } else {
        mensaje = `🏠🎉 *¡Felicidades ${nombre}!*

Hoy se cumplen *${añoTexto}* desde que recibiste las llaves de tu hogar en *${desarrollo}*.

Esperamos que sigas disfrutando tu casa y creando recuerdos increíbles. ¡Gracias por seguir siendo parte de la familia Santa Rita!

🎁 Recuerda que tenemos beneficios especiales para ti si nos recomiendas.`;
      }

      try {
        await meta.sendWhatsAppMessage(cliente.phone, mensaje);
        felicitados++;
        console.log(`🏠 Aniversario ${años} año(s) felicitado: ${cliente.name}`);

        // Marcar como felicitado + guardar contexto para respuesta
        const notesActuales = typeof cliente.notes === 'object' ? cliente.notes : {};
        const pendingAutoResponse = {
          type: 'aniversario',
          sent_at: new Date().toISOString(),
          vendedor_id: cliente.assigned_to,
          años: años
        };
        await supabase.client.from('leads').update({
          notes: typeof notesActuales === 'object'
            ? { ...notesActuales, [`Aniversario ${añoActual}`]: true, pending_auto_response: pendingAutoResponse }
            : `${notesActuales}\n[Aniversario ${añoActual}] Felicitado`
        }).eq('id', cliente.id);

        // Agrupar por vendedor para notificar
        const vendedorId = cliente.assigned_to;
        if (vendedorId) {
          if (!aniversariosPorVendedor.has(vendedorId)) {
            aniversariosPorVendedor.set(vendedorId, []);
          }
          aniversariosPorVendedor.get(vendedorId)!.push({ cliente, años });
        }

      } catch (e) {
        console.error(`❌ Error felicitando aniversario de ${cliente.name}:`, e);
      }

      await new Promise(r => setTimeout(r, 1500));
    }

    // Notificar a vendedores sobre aniversarios de sus clientes
    for (const [vendedorId, clientes] of aniversariosPorVendedor) {
      const vendedor = teamMembers?.find(tm => tm.id === vendedorId) ||
                       (clientes[0].cliente.team_members as any);
      if (!vendedor?.phone) continue;

      let msg = `🏠 *ANIVERSARIOS DE COMPRA*\n\n`;
      msg += `Hoy celebran aniversario ${clientes.length} de tus clientes:\n\n`;

      for (const { cliente, años } of clientes.slice(0, 5)) {
        msg += `• *${cliente.name}* - ${años} año(s)\n`;
        msg += `  📱 ${cliente.phone}\n`;
        if (cliente.property_interest) msg += `  🏠 ${cliente.property_interest}\n`;
        msg += `\n`;
      }
      if (clientes.length > 5) msg += `_...y ${clientes.length - 5} más_\n`;

      msg += `💡 *Ya les enviamos felicitación automática.*\n`;
      msg += `_Buen momento para pedir referidos 🎁_`;

      try {
        await meta.sendWhatsAppMessage(vendedor.phone, msg);
        console.log(`📤 Notificación de aniversarios enviada a ${vendedor.name}`);
      } catch (e) {
        console.log('Error notificando vendedor:', e);
      }
    }

    console.log(`✅ Felicitaciones de aniversario completadas: ${felicitados} clientes`);
  } catch (error) {
    console.error('❌ Error en felicitaciones de aniversario:', error);
  }
}
