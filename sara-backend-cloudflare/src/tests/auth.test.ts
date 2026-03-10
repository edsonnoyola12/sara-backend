import { describe, it, expect } from 'vitest';
import {
  createJWT,
  createRefreshToken,
  verifyJWT,
  hashPassword,
  verifyPassword,
  authenticateRequest,
  getJWTSecret,
} from '../middleware/auth';

// ═══════════════════════════════════════════════════════════════════════════
// AUTH TESTS — JWT, password hashing, middleware
// ═══════════════════════════════════════════════════════════════════════════

const TEST_SECRET = 'jwt:test-secret-key-for-testing';
const TEST_PAYLOAD = {
  sub: 'user-123',
  email: 'test@example.com',
  role: 'admin',
  tenantId: '00000000-0000-0000-0000-000000000001',
  teamMemberId: 'tm-456',
};

describe('Auth System', () => {
  // ━━━ JWT Creation ━━━
  describe('createJWT', () => {
    it('creates a valid JWT string', async () => {
      const token = await createJWT(TEST_PAYLOAD, TEST_SECRET);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      // JWT has 3 parts separated by dots
      const parts = token.split('.');
      expect(parts.length).toBe(3);
    });

    it('JWT contains correct header', async () => {
      const token = await createJWT(TEST_PAYLOAD, TEST_SECRET);
      const header = JSON.parse(atob(token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')));
      expect(header.alg).toBe('HS256');
      expect(header.typ).toBe('JWT');
    });

    it('JWT contains correct payload', async () => {
      const token = await createJWT(TEST_PAYLOAD, TEST_SECRET);
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      expect(payload.sub).toBe('user-123');
      expect(payload.email).toBe('test@example.com');
      expect(payload.role).toBe('admin');
      expect(payload.tenantId).toBe('00000000-0000-0000-0000-000000000001');
      expect(payload.teamMemberId).toBe('tm-456');
      expect(payload.iat).toBeDefined();
      expect(payload.exp).toBeDefined();
      expect(payload.exp).toBeGreaterThan(payload.iat);
    });

    it('uses 8-hour expiry by default', async () => {
      const token = await createJWT(TEST_PAYLOAD, TEST_SECRET);
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      expect(payload.exp - payload.iat).toBe(8 * 60 * 60);
    });

    it('accepts custom expiry', async () => {
      const token = await createJWT(TEST_PAYLOAD, TEST_SECRET, 3600);
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      expect(payload.exp - payload.iat).toBe(3600);
    });
  });

  // ━━━ JWT Verification ━━━
  describe('verifyJWT', () => {
    it('verifies a valid token', async () => {
      const token = await createJWT(TEST_PAYLOAD, TEST_SECRET);
      const result = await verifyJWT(token, TEST_SECRET);
      expect(result).not.toBeNull();
      expect(result!.sub).toBe('user-123');
      expect(result!.email).toBe('test@example.com');
      expect(result!.role).toBe('admin');
      expect(result!.tenantId).toBe('00000000-0000-0000-0000-000000000001');
    });

    it('rejects token with wrong secret', async () => {
      const token = await createJWT(TEST_PAYLOAD, TEST_SECRET);
      const result = await verifyJWT(token, 'wrong-secret');
      expect(result).toBeNull();
    });

    it('rejects expired token', async () => {
      const token = await createJWT(TEST_PAYLOAD, TEST_SECRET, -1); // Already expired
      const result = await verifyJWT(token, TEST_SECRET);
      expect(result).toBeNull();
    });

    it('rejects malformed token', async () => {
      const result = await verifyJWT('not.a.valid.token', TEST_SECRET);
      expect(result).toBeNull();
    });

    it('rejects empty string', async () => {
      const result = await verifyJWT('', TEST_SECRET);
      expect(result).toBeNull();
    });

    it('rejects tampered payload', async () => {
      const token = await createJWT(TEST_PAYLOAD, TEST_SECRET);
      const parts = token.split('.');
      // Tamper with payload
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      payload.role = 'superadmin';
      const tamperedPayload = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
      const result = await verifyJWT(tamperedToken, TEST_SECRET);
      expect(result).toBeNull();
    });
  });

  // ━━━ Refresh Token ━━━
  describe('createRefreshToken', () => {
    it('creates refresh token with 30-day expiry', async () => {
      const token = await createRefreshToken(TEST_PAYLOAD, TEST_SECRET);
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      expect(payload.exp - payload.iat).toBe(30 * 24 * 60 * 60);
    });

    it('refresh token is verifiable', async () => {
      const token = await createRefreshToken(TEST_PAYLOAD, TEST_SECRET);
      const result = await verifyJWT(token, TEST_SECRET);
      expect(result).not.toBeNull();
      expect(result!.sub).toBe('user-123');
    });
  });

  // ━━━ Password Hashing ━━━
  describe('hashPassword', () => {
    it('produces a hash string', async () => {
      const hash = await hashPassword('testpassword');
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.startsWith('pbkdf2:')).toBe(true);
    });

    it('hash format is pbkdf2:iterations:salt:hash', async () => {
      const hash = await hashPassword('testpassword');
      const parts = hash.split(':');
      expect(parts.length).toBe(4);
      expect(parts[0]).toBe('pbkdf2');
      expect(parseInt(parts[1], 10)).toBe(100000);
      expect(parts[2].length).toBe(32); // 16 bytes = 32 hex chars
      expect(parts[3].length).toBe(64); // 32 bytes = 64 hex chars
    });

    it('produces different hashes for same password (random salt)', async () => {
      const hash1 = await hashPassword('samepassword');
      const hash2 = await hashPassword('samepassword');
      expect(hash1).not.toBe(hash2);
    });
  });

  // ━━━ Password Verification ━━━
  describe('verifyPassword', () => {
    it('verifies correct password', async () => {
      const hash = await hashPassword('mypassword123');
      const result = await verifyPassword('mypassword123', hash);
      expect(result).toBe(true);
    });

    it('rejects wrong password', async () => {
      const hash = await hashPassword('mypassword123');
      const result = await verifyPassword('wrongpassword', hash);
      expect(result).toBe(false);
    });

    it('handles special characters', async () => {
      const password = 'p@$$w0rd!#%^&*()';
      const hash = await hashPassword(password);
      const result = await verifyPassword(password, hash);
      expect(result).toBe(true);
    });

    it('rejects malformed hash gracefully', async () => {
      const result = await verifyPassword('test', 'not-a-valid-hash');
      expect(result).toBe(false);
    });
  });

  // ━━━ authenticateRequest ━━━
  describe('authenticateRequest', () => {
    it('extracts JWT from Authorization header', async () => {
      const token = await createJWT(TEST_PAYLOAD, TEST_SECRET);
      const request = new Request('https://api.example.com/api/leads', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await authenticateRequest(request, TEST_SECRET);
      expect(result).not.toBeNull();
      expect(result!.sub).toBe('user-123');
    });

    it('returns null for missing Authorization header', async () => {
      const request = new Request('https://api.example.com/api/leads');
      const result = await authenticateRequest(request, TEST_SECRET);
      expect(result).toBeNull();
    });

    it('returns null for non-Bearer auth', async () => {
      const request = new Request('https://api.example.com/api/leads', {
        headers: { Authorization: 'Basic dXNlcjpwYXNz' },
      });
      const result = await authenticateRequest(request, TEST_SECRET);
      expect(result).toBeNull();
    });

    it('returns null for invalid Bearer token', async () => {
      const request = new Request('https://api.example.com/api/leads', {
        headers: { Authorization: 'Bearer invalid.token.here' },
      });
      const result = await authenticateRequest(request, TEST_SECRET);
      expect(result).toBeNull();
    });
  });

  // ━━━ getJWTSecret ━━━
  describe('getJWTSecret', () => {
    it('derives JWT secret from API_SECRET', () => {
      const secret = getJWTSecret('my-api-secret');
      expect(secret).toBe('jwt:my-api-secret');
    });

    it('uses default when API_SECRET is undefined', () => {
      const secret = getJWTSecret(undefined);
      expect(secret).toBe('jwt:default-dev-secret');
    });
  });

  // ━━━ End-to-end flow ━━━
  describe('E2E auth flow', () => {
    it('full login → verify → refresh cycle', async () => {
      // 1. Hash password
      const hash = await hashPassword('sara2026!');

      // 2. Verify password
      const passwordOk = await verifyPassword('sara2026!', hash);
      expect(passwordOk).toBe(true);

      // 3. Create JWT
      const token = await createJWT(TEST_PAYLOAD, TEST_SECRET);
      expect(token).toBeDefined();

      // 4. Verify JWT
      const payload = await verifyJWT(token, TEST_SECRET);
      expect(payload).not.toBeNull();
      expect(payload!.email).toBe('test@example.com');

      // 5. Create refresh token
      const refresh = await createRefreshToken(TEST_PAYLOAD, TEST_SECRET);

      // 6. Use refresh token to get new access token
      const refreshPayload = await verifyJWT(refresh, TEST_SECRET);
      expect(refreshPayload).not.toBeNull();

      // 7. Create new access token from refresh payload
      const newToken = await createJWT({
        sub: refreshPayload!.sub,
        email: refreshPayload!.email,
        role: refreshPayload!.role,
        tenantId: refreshPayload!.tenantId,
      }, TEST_SECRET);
      const newPayload = await verifyJWT(newToken, TEST_SECRET);
      expect(newPayload).not.toBeNull();
      expect(newPayload!.sub).toBe('user-123');
    });
  });
});
