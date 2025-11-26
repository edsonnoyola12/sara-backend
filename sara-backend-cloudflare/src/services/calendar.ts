export class CalendarService {
  private serviceAccountEmail: string;
  private privateKey: string;
  public calendarId: string;

  constructor(serviceAccountEmail: string, privateKey: string, calendarId: string) {
    this.serviceAccountEmail = serviceAccountEmail;
    this.privateKey = privateKey;
    this.calendarId = calendarId;
  }

  public async getAccessToken() {
    try {
      const now = Math.floor(Date.now() / 1000);
      const expiry = now + 3600;

      const header = { alg: 'RS256', typ: 'JWT' };
      const claimSet = {
        iss: this.serviceAccountEmail,
        scope: 'https://www.googleapis.com/auth/calendar',
        aud: 'https://oauth2.googleapis.com/token',
        exp: expiry,
        iat: now
      };

      const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
      const encodedClaimSet = btoa(JSON.stringify(claimSet)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
      const signatureInput = `${encodedHeader}.${encodedClaimSet}`;

      const privateKeyPEM = this.privateKey;
      const privateKeyBuffer = this.pemToArrayBuffer(privateKeyPEM);
      
      const key = await crypto.subtle.importKey(
        'pkcs8',
        privateKeyBuffer,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign']
      );

      const signature = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        key,
        new TextEncoder().encode(signatureInput)
      );

      const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

      const jwt = `${signatureInput}.${encodedSignature}`;

      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
      });

      const data = await response.json();
      
      if (!response.ok) {
        console.error('❌ Token request failed:', data);
        return null;
      }

      return data.access_token;
    } catch (error) {
      console.error('❌ Error getting access token:', error);
      return null;
    }
  }

  private pemToArrayBuffer(pem: string): ArrayBuffer {
    const pemContents = pem
      .replace('-----BEGIN PRIVATE KEY-----', '')
      .replace('-----END PRIVATE KEY-----', '')
      .replace(/\s/g, '');
    
    const binaryString = atob(pemContents);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  async getEvents(): Promise<any> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) {
        return { error: 'No access token', items: [] };
      }

      const now = new Date().toISOString();
      const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events?timeMin=${encodeURIComponent(now)}&timeMax=${encodeURIComponent(nextMonth)}&singleEvents=true&orderBy=startTime`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );

      return await response.json();
    } catch (error) {
      console.error('❌ Error getting events:', error);
      return { error: String(error), items: [] };
    }
  }

  async getAvailableSlots(date: string): Promise<string[]> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) return [];

      const startOfDay = `${date}T00:00:00-06:00`;
      const endOfDay = `${date}T23:59:59-06:00`;

      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events?timeMin=${encodeURIComponent(startOfDay)}&timeMax=${encodeURIComponent(endOfDay)}&singleEvents=true&orderBy=startTime`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );

      const data = await response.json();
      const workingHours = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
      const busyTimes = new Set<string>();

      if (data.items && data.items.length > 0) {
        data.items.forEach((event: any) => {
          if (event.start && event.start.dateTime) {
            const startTime = new Date(event.start.dateTime);
            const hour = String(startTime.getHours()).padStart(2, '0') + ':00';
            busyTimes.add(hour);
          }
        });
      }

      return workingHours.filter(hour => !busyTimes.has(hour));
    } catch (error) {
      console.error('❌ Error checking availability:', error);
      return [];
    }
  }

  async createEvent(summary: string, description: string, startTime: string, endTime: string, attendees?: { email: string, name?: string }[]) {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) return null;

      const event: any = {
        summary,
        description,
        start: { dateTime: startTime, timeZone: 'America/Mexico_City' },
        end: { dateTime: endTime, timeZone: 'America/Mexico_City' },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 30 },
            { method: 'email', minutes: 60 }
          ]
        }
      };

      if (attendees && attendees.length > 0) {
        event.attendees = attendees.map(a => ({
          email: a.email,
          displayName: a.name || a.email
        }));
        event.sendUpdates = 'all';
      }

      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events?sendUpdates=all`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(event)
        }
      );

      return await response.json();
    } catch (error) {
      console.error('❌ Calendar Error:', error);
      return null;
    }
  }

  async deleteEvent(eventId: string): Promise<boolean> {
    try {
      const accessToken = await this.getAccessToken();
      if (!accessToken) return false;

      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events/${eventId}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );

      return response.ok;
    } catch (error) {
      console.error('❌ Error deleting event:', error);
      return false;
    }
  }
}
