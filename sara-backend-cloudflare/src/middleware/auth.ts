// ═══════════════════════════════════════════════════════════════════════════
// AUTH MIDDLEWARE — JWT verification for CRM frontend
// Uses crypto.subtle (Cloudflare Workers compatible, no external deps)
// ═══════════════════════════════════════════════════════════════════════════

export interface JWTPayload {
  sub: string;       // user ID (auth_users.id)
  email: string;
  role: string;      // admin, manager, viewer
  tenantId: string;
  teamMemberId?: string;
  iat: number;
  exp: number;
}

const JWT_ALGORITHM = 'HS256';
const JWT_EXPIRY_SECONDS = 8 * 60 * 60; // 8 hours
const JWT_REFRESH_EXPIRY_SECONDS = 30 * 24 * 60 * 60; // 30 days

// ━━━ Base64url encoding/decoding ━━━
function base64urlEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlEncodeString(str: string): string {
  return base64urlEncode(new TextEncoder().encode(str));
}

function base64urlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

// ━━━ HMAC-SHA256 signing ━━━
async function getSigningKey(secret: string): Promise<CryptoKey> {
  const keyData = new TextEncoder().encode(secret);
  return crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function sign(data: string, secret: string): Promise<string> {
  const key = await getSigningKey(secret);
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(data)
  );
  return base64urlEncode(new Uint8Array(signature));
}

async function verify(data: string, signature: string, secret: string): Promise<boolean> {
  const key = await getSigningKey(secret);
  const sigBytes = base64urlDecode(signature);
  return crypto.subtle.verify(
    'HMAC',
    key,
    sigBytes,
    new TextEncoder().encode(data)
  );
}

// ━━━ JWT Creation ━━━
export async function createJWT(
  payload: Omit<JWTPayload, 'iat' | 'exp'>,
  secret: string,
  expirySeconds: number = JWT_EXPIRY_SECONDS
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JWTPayload = {
    ...payload,
    iat: now,
    exp: now + expirySeconds,
  };

  const header = base64urlEncodeString(JSON.stringify({ alg: JWT_ALGORITHM, typ: 'JWT' }));
  const body = base64urlEncodeString(JSON.stringify(fullPayload));
  const unsigned = `${header}.${body}`;
  const signature = await sign(unsigned, secret);

  return `${unsigned}.${signature}`;
}

export async function createRefreshToken(
  payload: Omit<JWTPayload, 'iat' | 'exp'>,
  secret: string
): Promise<string> {
  return createJWT(payload, secret, JWT_REFRESH_EXPIRY_SECONDS);
}

// ━━━ JWT Verification ━━━
export async function verifyJWT(token: string, secret: string): Promise<JWTPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [header, body, signature] = parts;
    const unsigned = `${header}.${body}`;

    // Verify signature
    const isValid = await verify(unsigned, signature, secret);
    if (!isValid) return null;

    // Decode payload
    const payloadStr = new TextDecoder().decode(base64urlDecode(body));
    const payload: JWTPayload = JSON.parse(payloadStr);

    // Check expiry
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return null;

    return payload;
  } catch {
    return null;
  }
}

// ━━━ Password hashing (using PBKDF2 — CF Workers compatible) ━━━
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const hash = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  const hashHex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `pbkdf2:100000:${saltHex}:${hashHex}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [, iterStr, saltHex, storedHashHex] = stored.split(':');
    const iterations = parseInt(iterStr, 10);
    const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(h => parseInt(h, 16)));

    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const hash = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt,
        iterations,
        hash: 'SHA-256',
      },
      keyMaterial,
      256
    );

    const hashHex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex === storedHashHex;
  } catch {
    return false;
  }
}

// ━━━ Middleware: Extract and verify JWT from request ━━━
export async function authenticateRequest(
  request: Request,
  jwtSecret: string
): Promise<JWTPayload | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  return verifyJWT(token, jwtSecret);
}

// ━━━ JWT Secret helper ━━━
export function getJWTSecret(apiSecret?: string): string {
  // Derive JWT secret from API_SECRET (or use a dedicated env var in future)
  return `jwt:${apiSecret || 'default-dev-secret'}`;
}
