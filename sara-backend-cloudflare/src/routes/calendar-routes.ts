import { CalendarService } from '../services/calendar';
import { TwilioService } from '../services/twilio';
import { SupabaseService } from '../services/supabase';

export async function handleCalendarRoutes(
  request: Request,
  env: any,
  calendar: CalendarService
): Promise<Response | null> {
  const url = new URL(request.url);
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (url.pathname === '/api/calendar/events' && request.method === 'GET') {
    try {
      const data = await calendar.getEvents();
      return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: String(error), items: [] }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  }

  // POST - Crear cita y notificar por WhatsApp
  if (url.pathname === '/api/calendar/events' && request.method === 'POST') {
    try {
      const body = await request.json();
      const { summary, description, startTime, endTime, attendees } = body;
      
      // Crear evento en Google Calendar
      const event = await calendar.createEvent(summary, description, startTime, endTime, attendees);
      
      // Notificar por WhatsApp
      if (event && event.id) {
        const twilio = new TwilioService(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN, env.TWILIO_WHATSAPP_NUMBER);
        const supabase = new SupabaseService(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
        
        // Extraer info
        const eventDate = new Date(startTime).toLocaleString('es-MX', { 
          weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' 
        });
        
        // Buscar teléfono del cliente en la descripción
        const phoneMatch = description?.match(/Telefono:\s*(\+?\d+)/);
        const clientPhone = phoneMatch ? phoneMatch[1] : null;
        
        // Buscar nombre del cliente
        const clientMatch = description?.match(/Cliente:\s*([^\n]+)/);
        const clientName = clientMatch ? clientMatch[1].trim() : 'Cliente';
        
        const newApptMsg = `📅 NUEVA CITA AGENDADA\n\n${summary}\n🕐 ${eventDate}\n\n${description || ''}\n\n✅ Agregada al calendario`;
        
        // Notificar a vendedores activos
        const { data: vendedores } = await supabase.client
          .from('team_members')
          .select('*')
          .eq('role', 'vendedor')
          .eq('active', true);
        
        for (const v of (vendedores || [])) {
          if (v.phone) {
            await twilio.sendWhatsAppMessage('whatsapp:' + v.phone, newApptMsg);
          }
        }
        
        // Notificar al cliente si tiene teléfono
        if (clientPhone) {
          const clientMsg = `¡Hola ${clientName}! 👋\n\nTu cita ha sido confirmada:\n\n📅 ${summary}\n🕐 ${eventDate}\n\n¡Te esperamos! Si necesitas reagendar, responde a este mensaje.`;
          await twilio.sendWhatsAppMessage('whatsapp:' + clientPhone, clientMsg);
        }
        
        console.log('✅ Notificaciones de nueva cita enviadas');
      }
      
      return new Response(JSON.stringify(event), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    } catch (error) {
      console.error('❌ Error creando evento:', error);
      return new Response(JSON.stringify({ error: String(error) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  }

  // DELETE - Cancelar cita y notificar
  if (url.pathname.startsWith('/api/calendar/events/') && request.method === 'DELETE') {
    try {
      const eventId = url.pathname.split('/').pop();
      
      // Obtener detalles del evento antes de eliminarlo
      const events = await calendar.getEvents();
      const eventToDelete = events.items?.find((e: any) => e.id === eventId);
      
      // Eliminar el evento
      const success = await calendar.deleteEvent(eventId!);
      
      // Si se eliminó exitosamente, notificar por WhatsApp
      if (success && eventToDelete) {
        const twilio = new TwilioService(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN, env.TWILIO_WHATSAPP_NUMBER);
        const supabase = new SupabaseService(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
        
        const eventSummary = eventToDelete.summary || 'Cita';
        const eventDescription = eventToDelete.description || '';
        const eventDate = eventToDelete.start?.dateTime ? new Date(eventToDelete.start.dateTime).toLocaleString('es-MX') : 'Sin fecha';
        
        const phoneMatch = eventDescription.match(/Telefono:\s*(\+?\d+)/);
        const clientPhone = phoneMatch ? phoneMatch[1] : null;
        
        const clientMatch = eventDescription.match(/Cliente:\s*([^\n]+)/);
        const clientName = clientMatch ? clientMatch[1].trim() : 'Cliente';
        
        const cancelMsg = `❌ CITA CANCELADA\n\n📅 ${eventSummary}\n🕐 ${eventDate}\n\nEsta cita ha sido cancelada desde el CRM.`;
        
        // Notificar a vendedores activos
        const { data: vendedores } = await supabase.client
          .from('team_members')
          .select('*')
          .eq('role', 'vendedor')
          .eq('active', true);
        
        for (const v of (vendedores || [])) {
          if (v.phone) {
            await twilio.sendWhatsAppMessage('whatsapp:' + v.phone, cancelMsg);
          }
        }
        
        // Notificar al cliente
        if (clientPhone) {
          const clientMsg = `Hola ${clientName}, tu cita ha sido cancelada.\n\n📅 ${eventSummary}\n🕐 ${eventDate}\n\nSi deseas reagendar, responde a este mensaje. 📱`;
          await twilio.sendWhatsAppMessage('whatsapp:' + clientPhone, clientMsg);
        }
        
        console.log('✅ Notificaciones de cancelación enviadas');
      }
      
      return new Response(JSON.stringify({ success }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    } catch (error) {
      console.error('❌ Error cancelando evento:', error);
      return new Response(JSON.stringify({ error: String(error) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  }

  return null;
}
