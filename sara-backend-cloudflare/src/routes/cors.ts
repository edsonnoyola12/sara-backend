// ═══════════════════════════════════════════════════════════════════════════
// CORS - Consolidated whitelist and helpers
// Single source of truth for CRM origin validation
// ═══════════════════════════════════════════════════════════════════════════

export const ALLOWED_CRM_ORIGINS = [
  'https://sara-crm.vercel.app',
  'https://sara-crm-new.vercel.app',
  'https://sara-crm.netlify.app',
  'https://gruposantarita.com',
  'https://www.gruposantarita.com',
  'http://localhost:3000',
  'http://localhost:5173',
];

export function isAllowedCrmOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_CRM_ORIGINS.includes(origin)) return true;
  if (/^https:\/\/sara-crm.*\.vercel\.app$/.test(origin)) return true;
  return false;
}

export function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin');
  const allowed = origin && isAllowedCrmOrigin(origin);
  return {
    'Access-Control-Allow-Origin': allowed ? origin! : ALLOWED_CRM_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Pagination helper
// ═══════════════════════════════════════════════════════════════════════════

export function parsePagination(url: URL): { limit: number; offset: number; page: number } {
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50')));
  return { limit, offset: (page - 1) * limit, page };
}

export function paginatedResponse(data: any[], total: number, page: number, limit: number) {
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Input validation helpers
// ═══════════════════════════════════════════════════════════════════════════

export function validateRequired(body: any, fields: string[]): string | null {
  for (const f of fields) {
    if (body[f] === undefined || body[f] === null || body[f] === '') {
      return `Campo requerido: ${f}`;
    }
  }
  return null;
}

export function validatePhone(phone: string): boolean {
  return /^\d{10,15}$/.test(phone.replace(/\D/g, ''));
}

const VALID_ROLES = ['admin', 'vendedor', 'coordinador', 'asesor', 'agencia'];

export function validateRole(role: string): boolean {
  return VALID_ROLES.includes(role);
}

export function validateDateISO(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(new Date(date).getTime());
}
