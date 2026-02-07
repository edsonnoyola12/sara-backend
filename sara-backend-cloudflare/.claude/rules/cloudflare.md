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

## CRONs Configurados (HORAS EN UTC, México = UTC-6)

```toml
[triggers]
crons = [
  "*/2 * * * *",    # Cada 2 min (24/7): recordatorios, follow-ups, alertas, scoring, videos, Retell
  "0 14 * * 1-5",   # 2 PM UTC = 8 AM México L-V: briefings, reportes CEO, semanales, mensuales
  "0 1 * * *"       # 1 AM UTC = 7 PM México diario: reportes vendedores/asesores/marketing, recap sábado
]
```

### Handler de CRON
```typescript
async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
  const cron = event.cron;

  if (cron === '*/2 * * * *') {
    // Cada 2 min: usa mexicoHour para decidir qué ejecutar
    // Incluye: recordatorios citas, encuestas, follow-ups, scoring,
    // alertas, cumpleaños, nurturing, videos Veo3, llamadas Retell
    await tareasCada2Minutos();
  } else if (cron === '0 14 * * 1-5') {
    // 8 AM México L-V: briefings matutinos (template briefing_matutino),
    // reportes CEO, semanales (lunes), mensuales (día 1)
    await tareasMatutinas();
  } else if (cron === '0 1 * * *') {
    // 7 PM México diario: reportes vendedores (template reporte_vendedor),
    // reportes asesores (template reporte_asesor), marketing, recap sábado 2PM
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
