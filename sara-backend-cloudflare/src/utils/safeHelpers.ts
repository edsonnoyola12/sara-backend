/**
 * Safe JSON parse - wraps JSON.parse with try/catch and handles already-parsed objects.
 * Replaces the pattern: typeof x === 'string' ? JSON.parse(x) : x
 */
export function safeJsonParse(value: any, defaultValue: any = {}): any {
  if (value === null || value === undefined) return defaultValue;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (e) {
    console.error('safeJsonParse failed:', typeof value === 'string' ? value.substring(0, 100) : value);
    return defaultValue;
  }
}

/**
 * Sanitize user input before including in AI prompts.
 * Strips common prompt injection patterns while preserving legitimate names/messages.
 */
export function sanitizeForPrompt(input: string, maxLength: number = 500): string {
  if (!input) return '';
  let clean = input
    .replace(/```[\s\S]*?```/g, '')           // Remove code blocks
    .replace(/<[^>]+>/g, '')                   // Remove HTML tags
    .replace(/\{[^}]{20,}\}/g, '')             // Remove large JSON-like blocks
    .replace(/system\s*:/gi, '')               // Remove "system:" prefix
    .replace(/ignore\s+(all\s+)?(previous|above|prior)\s+(instructions?|rules?|prompts?)/gi, '[filtrado]')
    .replace(/you\s+are\s+now/gi, '[filtrado]')
    .replace(/act\s+as\s+(if|a)/gi, '[filtrado]')
    .replace(/forget\s+(everything|all|your)/gi, '[filtrado]')
    .replace(/new\s+instructions?:/gi, '[filtrado]')
    .replace(/override\s+(all|your|the)/gi, '[filtrado]');
  return clean.substring(0, maxLength).trim();
}

/**
 * Safe Supabase write - logs errors from .update()/.insert()/.upsert() calls.
 * Usage: const { error } = await safeSupabaseWrite(supabase.from('table').update(data).eq('id', id), 'context');
 */
export async function safeSupabaseWrite(
  query: PromiseLike<{ error: any; data: any }>,
  context: string
): Promise<{ error: any; data: any }> {
  const result = await query;
  if (result.error) {
    console.error(`❌ Supabase write failed [${context}]:`, result.error.message || result.error);
  }
  return result;
}
