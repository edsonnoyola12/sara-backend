# Reglas para Cloudflare Workers

## Configuración

| Archivo | Propósito |
|---------|-----------|
| `wrangler.toml` | Configuración del Worker |
| `.dev.vars` | Variables locales (NO commitear) |
| Cloudflare Dashboard | Secrets de producción |

---

## Límites de Cloudflare Workers

| Límite | Valor | Consecuencia |
|--------|-------|--------------|
| CPU time | 30s (paid) | Timeout si se excede |
| Memory | 128 MB | OOM si se excede |
| Subrequest | 1000/request | Error si se excede |
| KV reads | 1000/request | Error si se excede |
| KV writes | 1000/request | Error si se excede |
| Script size | 10 MB | No deploya |

---

## Estructura del Worker

```typescript
export default {
  // Handler HTTP
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Manejar request
  },

  // Handler de CRONs
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // Ejecutar tareas programadas
  }
};
```

---

## Variables de Entorno (Env)

```typescript
interface Env {
  // Supabase
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;

  // Meta/WhatsApp
  META_ACCESS_TOKEN: string;
  META_PHONE_NUMBER_ID: string;
  META_WEBHOOK_SECRET?: string;

  // Anthropic
  ANTHROPIC_API_KEY: string;

  // Google
  GOOGLE_SERVICE_ACCOUNT_JSON: string;
  VEO_API_KEY: string;

  // Auth
  API_SECRET: string;

  // KV Namespace
  SARA_CACHE: KVNamespace;
}
```

---

## CRONs Configurados

```toml
[triggers]
crons = [
  "*/2 * * * *",    # Cada 2 min: leads sin asignar
  "0 14 * * 1-5",   # 2 PM L-V: follow-ups
  "0 1 * * *"       # 1 AM diario: tareas nocturnas
]
```

### Handler de CRON
```typescript
async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
  const cron = event.cron;

  if (cron === '*/2 * * * *') {
    await checkLeadsSinAsignar();
  } else if (cron === '0 14 * * 1-5') {
    await enviarFollowUps();
  } else if (cron === '0 1 * * *') {
    await tareasNocturnas();
  }
}
```

---

## KV Cache

### Leer
```typescript
const cached = await env.SARA_CACHE.get('key', 'json');
if (cached) return cached;
```

### Escribir
```typescript
await env.SARA_CACHE.put('key', JSON.stringify(data), {
  expirationTtl: 300 // 5 minutos
});
```

### TTLs Recomendados
| Dato | TTL |
|------|-----|
| team_members | 5 min |
| properties | 10 min |
| config | 1 hora |
| stats | 1 min |

---

## Deploy

```bash
# Desarrollo local
npx wrangler dev

# Staging
npx wrangler deploy --env staging

# Producción
npx wrangler deploy

# Ver logs
npx wrangler tail --format=pretty

# Secrets
npx wrangler secret put API_SECRET
```

---

## Environments

| Env | URL | CRONs |
|-----|-----|-------|
| Production | `sara-backend.edson-633.workers.dev` | ✅ Activos |
| Staging | `sara-backend-staging.edson-633.workers.dev` | ❌ Desactivados |

---

## Errores Comunes

### 1. Script too large
```
Error: Script startup exceeded CPU time limit
```
**Solución**: Reducir imports, lazy loading

### 2. Subrequest limit
```
Error: Too many subrequests
```
**Solución**: Batch requests, usar cache

### 3. KV timeout
```
Error: KV GET timed out
```
**Solución**: Fallback a DB, retry logic
