// SMS Service via Twilio REST API (Cloudflare Workers compatible)

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  phoneNumber: string; // from number
}

export interface SMSResult {
  sid: string | null;
  error?: string;
}

/**
 * Ensure phone has + prefix and country code.
 * Mexican numbers: 10 digits -> +52, starts with 52 -> +52, etc.
 */
export function formatPhoneForSMS(phone: string): string {
  let digits = phone.replace(/\D/g, '');

  // 10 digits = Mexican local -> +52
  if (digits.length === 10) {
    return `+52${digits}`;
  }
  // 12 digits starting with 52 -> already has country code
  if (digits.length === 12 && digits.startsWith('52')) {
    return `+${digits}`;
  }
  // 13 digits starting with 521 -> strip the 1 (mobile prefix not needed for SMS)
  if (digits.length === 13 && digits.startsWith('521')) {
    return `+52${digits.slice(3)}`;
  }
  // Already has + prefix
  if (phone.startsWith('+')) {
    return phone;
  }

  return `+${digits}`;
}

/**
 * Send SMS via Twilio REST API using fetch (no Node.js modules).
 */
export async function sendSMS(
  config: TwilioConfig,
  to: string,
  body: string
): Promise<SMSResult> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;
  const toFormatted = formatPhoneForSMS(to);

  const formData = new URLSearchParams({
    From: config.phoneNumber,
    To: toFormatted,
    Body: body,
  });

  const auth = btoa(`${config.accountSid}:${config.authToken}`);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    const result = await res.json() as any;

    if (!res.ok) {
      console.error('[SMS] Twilio error:', result.message || result);
      return { sid: null, error: result.message || `HTTP ${res.status}` };
    }

    console.log('[SMS] Sent:', result.sid, 'to', toFormatted);
    return { sid: result.sid };
  } catch (err: any) {
    console.error('[SMS] Fetch error:', err.message);
    return { sid: null, error: err.message };
  }
}
