# Guía de Migración de Rutas

Este documento describe el patrón para migrar rutas desde `index.ts` a archivos separados.

## Arquitectura Actual

```
src/
├── index.ts                    # 14,663 líneas - monolito principal
├── routes/
│   ├── team-routes.ts          # ✅ Migrado
│   ├── promotions.ts           # ✅ Migrado
│   ├── calendar-routes.ts      # ✅ Migrado
│   └── [nuevas-rutas].ts       # Pendientes de migrar
├── services/
│   ├── ServiceFactory.ts       # ✅ Nuevo - Singleton pattern
│   └── ...
└── tests/
    ├── dateParser.test.ts      # ✅ Nuevo
    ├── leadScoring.test.ts     # ✅ Nuevo
    └── ServiceFactory.test.ts  # ✅ Nuevo
```

## Patrón de Migración

### 1. Crear archivo de rutas

```typescript
// src/routes/leads-routes.ts
import { ServiceFactory } from '../services/ServiceFactory';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function corsResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

export async function handleLeadRoutes(
  request: Request,
  url: URL,
  factory: ServiceFactory
): Promise<Response | null> {
  const supabase = factory.getSupabase();
  const meta = factory.getMeta();

  // GET /api/leads
  if (url.pathname === '/api/leads' && request.method === 'GET') {
    const { data } = await supabase.client
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false });
    return corsResponse(data || []);
  }

  // ... más rutas

  return null; // No manejada
}
```

### 2. Integrar en index.ts

```typescript
import { handleLeadRoutes } from './routes/leads-routes';
import { getServiceFactory } from './services/ServiceFactory';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const factory = getServiceFactory(env);

    // Delegar a rutas de leads
    if (url.pathname.startsWith('/api/leads')) {
      const response = await handleLeadRoutes(request, url, factory);
      if (response) return response;
    }

    // ... resto de rutas en index.ts
  }
}
```

## Prioridad de Migración

| Dominio | Líneas aprox | Complejidad | Prioridad |
|---------|--------------|-------------|-----------|
| Leads | 650 | Alta | Media |
| Appointments | 500 | Alta | Media |
| Webhooks | 400 | Crítica | Alta |
| Properties | 100 | Baja | Baja |
| Dashboard/Reports | 300 | Media | Baja |
| Templates | 200 | Media | Baja |
| HeyGen/Videos | 400 | Media | Baja |

## Tests Requeridos

Antes de migrar cada dominio:

1. **Unit tests** para helpers y utilidades
2. **Integration tests** para flujos críticos
3. **Verificar en staging** antes de producción

## ServiceFactory

Usar `ServiceFactory` en lugar de crear instancias directamente:

```typescript
// ❌ Antes (cada request crea instancias nuevas)
const supabase = new SupabaseService(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
const meta = new MetaWhatsAppService(env.META_PHONE_NUMBER_ID, env.META_ACCESS_TOKEN);

// ✅ Después (singleton, reutiliza instancias)
const factory = getServiceFactory(env);
const supabase = factory.getSupabase();
const meta = factory.getMeta();
```

## Checklist de Migración

- [ ] Crear archivo en `src/routes/`
- [ ] Implementar función `handle*Routes()`
- [ ] Escribir tests unitarios
- [ ] Integrar en `index.ts` con delegación
- [ ] Probar en local con `wrangler dev`
- [ ] Deploy a staging
- [ ] Verificar logs en staging
- [ ] Deploy a producción
- [ ] Eliminar código duplicado de `index.ts`
