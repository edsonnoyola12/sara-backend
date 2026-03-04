// src/services/calendar.ts
// Servicio optimizado para Google Calendar en Cloudflare Workers (Edge)

import { retry, RetryPresets } from './retryService';

// Interfaces para tipado fuerte
export interface CalendarEventInput {
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
  attendees?: { email: string; displayName?: string }[];
  conferenceData?: any;
  reminders?: {
    useDefault: boolean;
    overrides?: { method: 'email' | 'popup'; minutes: number }[];
  };
}

export class CalendarService {
  private serviceAccountEmail: string;
  private privateKey: string;
  private calendarId: string;
  
  // Cache del token para no pedirlo en cada request
  private cachedToken: string | null = null;
  private tokenExpiration: number = 0;

  constructor(serviceAccountEmail: string, privateKey: string, calendarId: string) {
    this.serviceAccountEmail = serviceAccountEmail;
    this.privateKey = privateKey.replace(/\\n/g, '\n');
    this.calendarId = calendarId;
  }

  // ═══════════════════════════════════════════════════════════════
  // FETCH CON RETRY - Reintentos automáticos para Google Calendar API
  // ═══════════════════════════════════════════════════════════════
  private async fetchWithRetry(url: string, options: RequestInit, context: string): Promise<Response> {
    return retry(
      async () => {
        const response = await fetch(url, options);

        // Si es error 5xx o 429 (rate limit), lanzar para reintentar
        if (response.status >= 500 || response.status === 429) {
          const error = new Error(`Google Calendar API Error: ${response.status}`);
          (error as any).status = response.status;
          throw error;
        }

        return response;
      },
      {
        ...RetryPresets.google,
        onRetry: (error, attempt, delayMs) => {
          console.warn(JSON.stringify({
            timestamp: new Date().toISOString(),
            level: 'warn',
            message: `Google Calendar retry ${attempt}/3`,
            context,
            error: error?.message,
            status: error?.status,
            delayMs,
          }));
        }
      }
    );
  }

  // Helper para Base64URL (necesario para JWT)
  private base64UrlEncode(input: string | Uint8Array): string {
    const source = typeof input === 'string' ? btoa(input) : btoa(String.fromCharCode(...input));
    return source.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  private async getAccessToken(): Promise<string> {
    // Verificar si tenemos un token válido en caché (con 5 min de margen)
    const now = Math.floor(Date.now() / 1000);
    if (this.cachedToken && now < this.tokenExpiration - 300) {
      return this.cachedToken;
    }

    const exp = now + 3600;

    const header = this.base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = this.base64UrlEncode(JSON.stringify({
      iss: this.serviceAccountEmail,
      scope: 'https://www.googleapis.com/auth/calendar',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: exp
    }));

    const signatureInput = `${header}.${payload}`;
    
    const pemHeader = '-----BEGIN PRIVATE KEY-----';
    const pemFooter = '-----END PRIVATE KEY-----';
    const pemContents = this.privateKey
      .replace(pemHeader, '')
      .replace(pemFooter, '')
      .replace(/\s/g, '');
    
    const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
    
    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8',
      binaryKey,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      new TextEncoder().encode(signatureInput)
    );

    const signature = this.base64UrlEncode(new Uint8Array(signatureBuffer));
    const jwt = `${header}.${payload}.${signature}`;

    // Fetch con retry para obtener el token
    const tokenData = await retry(
      async () => {
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
        });

        if (tokenResponse.status >= 500 || tokenResponse.status === 429) {
          const error = new Error(`Google OAuth Error: ${tokenResponse.status}`);
          (error as any).status = tokenResponse.status;
          throw error;
        }

        if (!tokenResponse.ok) {
          const errorText = await tokenResponse.text();
          throw new Error(`Error obteniendo token OAuth: ${errorText}`);
        }

        return tokenResponse.json() as Promise<any>;
      },
      {
        ...RetryPresets.google,
        onRetry: (error, attempt, delayMs) => {
          console.warn(JSON.stringify({
            timestamp: new Date().toISOString(),
            level: 'warn',
            message: `Google OAuth retry ${attempt}/3`,
            error: error?.message,
            delayMs,
          }));
        }
      }
    );
    
    // Guardar en caché
    this.cachedToken = tokenData.access_token;
    this.tokenExpiration = now + 3600;

    return tokenData.access_token;
  }

  // ═══════════════════════════════════════════════════════════════
  // CREAR EVENTO
  // ═══════════════════════════════════════════════════════════════
  async createEvent(eventData: CalendarEventInput): Promise<any> {
    const token = await this.getAccessToken();

    console.log('📆 createEvent:', eventData.summary);
    console.log('📆 Calendar ID:', this.calendarId);

    const finalEvent = {
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 30 },
          { method: 'email', minutes: 60 }
        ]
      },
      ...eventData,
    };

    const response = await this.fetchWithRetry(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events?conferenceDataVersion=1`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(finalEvent)
      },
      'createEvent'
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Error creando evento:', error);
      throw new Error(`Google Calendar API Error: ${error}`);
    }

    const result = await response.json().catch(() => ({})) as any;
    console.log('✅ Evento creado:', result.id);
    return result;
  }

  // ═══════════════════════════════════════════════════════════════
  // ACTUALIZAR EVENTO
  // ═══════════════════════════════════════════════════════════════
  async updateEvent(eventId: string, updates: Partial<CalendarEventInput>): Promise<any> {
    const token = await this.getAccessToken();

    console.log('📆 updateEvent:', eventId);
    console.log('📆 updateEvent BODY:', JSON.stringify(updates));

    const response = await this.fetchWithRetry(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events/${eventId}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      },
      'updateEvent'
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Error actualizando evento:', error);
      throw new Error(`Google Calendar API Error: ${error}`);
    }

    const result = await response.json().catch(() => ({})) as any;
    console.log('✅ Evento actualizado:', result.id);
    return result;
  }

  // ═══════════════════════════════════════════════════════════════
  // ELIMINAR EVENTO
  // ═══════════════════════════════════════════════════════════════
  async deleteEvent(eventId: string): Promise<boolean> {
    const token = await this.getAccessToken();
    
    console.log('📆 deleteEvent:', eventId);

    const response = await this.fetchWithRetry(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events/${eventId}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      },
      'deleteEvent'
    );

    if (!response.ok) {
      if (response.status === 410 || response.status === 404) {
        // El evento ya no existe, consideramos éxito
        console.log('✅ Evento ya eliminado (404/410):', eventId);
        return true;
      }
      const error = await response.text();
      console.error('❌ Error eliminando evento:', error);
      throw new Error(`Google Calendar API Error: ${error}`);
    }

    console.log('✅ Evento eliminado:', eventId);
    return true;
  }

  // ═══════════════════════════════════════════════════════════════
  // LISTAR EVENTOS
  // ═══════════════════════════════════════════════════════════════
  async getEvents(timeMin?: string, timeMax?: string, maxResults: number = 50): Promise<any[]> {
    const token = await this.getAccessToken();
    
    const min = timeMin || new Date().toISOString();
    let queryParams = `timeMin=${min}&singleEvents=true&orderBy=startTime&maxResults=${maxResults}`;
    
    if (timeMax) {
      queryParams += `&timeMax=${timeMax}`;
    }

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events?${queryParams}`,
      {
        headers: { 'Authorization': `Bearer ${token}` }
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Error obteniendo eventos:', error);
      return [];
    }

    const data = await response.json().catch(() => ({})) as any;
    return data.items || [];
  }

  // ═══════════════════════════════════════════════════════════════
  // VERIFICAR DISPONIBILIDAD
  // ═══════════════════════════════════════════════════════════════
  async checkAvailability(timeMin: string, timeMax: string): Promise<boolean> {
    const token = await this.getAccessToken();
    
    const response = await fetch(
      'https://www.googleapis.com/calendar/v3/freeBusy',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          timeMin,
          timeMax,
          items: [{ id: this.calendarId }]
        })
      }
    );

    if (!response.ok) {
      console.error('❌ Error checking availability');
      return false;
    }
    
    const data = await response.json().catch(() => ({})) as any;
    const busy = data.calendars[this.calendarId]?.busy || [];
    
    return busy.length === 0; // true si está libre
  }

  // ═══════════════════════════════════════════════════════════════
  // BUSCAR EVENTOS POR NOMBRE (para encontrar duplicados)
  // ═══════════════════════════════════════════════════════════════
  async findEventsByName(searchText: string, timeMin?: string, timeMax?: string): Promise<any[]> {
    const token = await this.getAccessToken();

    // Buscar en un rango amplio si no se especifica
    const min = timeMin || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 días atrás
    const max = timeMax || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(); // 90 días adelante

    const queryParams = `timeMin=${min}&timeMax=${max}&singleEvents=true&orderBy=startTime&maxResults=100&q=${encodeURIComponent(searchText)}`;

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events?${queryParams}`,
      {
        headers: { 'Authorization': `Bearer ${token}` }
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Error buscando eventos:', error);
      return [];
    }

    const data = await response.json().catch(() => ({})) as any;
    return data.items || [];
  }

  // ═══════════════════════════════════════════════════════════════
  // WEBHOOK - Suscribirse a cambios del calendario
  // ═══════════════════════════════════════════════════════════════
  async watchCalendar(channelId: string, webhookUrl: string): Promise<any> {
    const token = await this.getAccessToken();
    
    console.log('📆 Configurando webhook:', channelId, webhookUrl);

    // El webhook expira en 7 días (máximo permitido)
    const expiration = Date.now() + 7 * 24 * 60 * 60 * 1000;

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events/watch`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: channelId,
          type: 'web_hook',
          address: webhookUrl,
          expiration: expiration.toString()
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Error configurando webhook:', error);
      throw new Error(`Calendar Watch API Error: ${error}`);
    }

    const result = await response.json().catch(() => ({})) as any;
    console.log('✅ Webhook configurado:', result);
    return result;
  }

  // ═══════════════════════════════════════════════════════════════
  // DETENER WEBHOOK
  // ═══════════════════════════════════════════════════════════════
  async stopWatch(channelId: string, resourceId: string): Promise<void> {
    const token = await this.getAccessToken();
    
    const response = await fetch(
      'https://www.googleapis.com/calendar/v3/channels/stop',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: channelId,
          resourceId: resourceId
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Error deteniendo webhook:', error);
    }

    console.log('✅ Webhook detenido');
  }
}
