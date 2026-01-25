# SARA Backend - Load Tests

Tests de carga para medir el rendimiento del sistema bajo diferentes condiciones.

## Quick Start

### Opción 1: Simple Load Test (sin dependencias)

```bash
# Test básico (10 VUs, 30 segundos)
node scripts/load-tests/simple-load-test.js

# Con configuración personalizada
node scripts/load-tests/simple-load-test.js --vus=50 --duration=60

# Con API_SECRET para probar endpoints protegidos
API_SECRET=tu_api_secret node scripts/load-tests/simple-load-test.js

# Contra staging
BASE_URL=https://sara-backend-staging.edson-633.workers.dev node scripts/load-tests/simple-load-test.js

# Contra producción
BASE_URL=https://sara-backend.edson-633.workers.dev API_SECRET=xxx node scripts/load-tests/simple-load-test.js
```

### Opción 2: k6 (más completo)

```bash
# Instalar k6
brew install k6  # Mac
# o ver: https://k6.io/docs/getting-started/installation/

# Ejecutar test
k6 run scripts/load-tests/k6-load-test.js

# Con más usuarios
k6 run --vus 50 --duration 60s scripts/load-tests/k6-load-test.js

# Con API_SECRET
k6 run -e API_SECRET=tu_api_secret -e BASE_URL=https://sara-backend.edson-633.workers.dev scripts/load-tests/k6-load-test.js

# Guardar resultados en JSON
k6 run --out json=results.json scripts/load-tests/k6-load-test.js
```

## Escenarios de k6

El script de k6 incluye 3 escenarios:

| Escenario | VUs | Duración | Propósito |
|-----------|-----|----------|-----------|
| constant_load | 10 | 30s | Carga constante normal |
| ramping_load | 0→20→50→0 | 70s | Test de estrés gradual |
| spike_test | 0→100→0 | 20s | Pico súbito de tráfico |

## Métricas Monitoreadas

### Simple Load Test
- Total requests
- Success/Fail rate
- Rate limited (429)
- Latency (min, max, avg, P50, P90, P95, P99)
- Requests por segundo

### k6
- `http_req_duration`: Latencia de requests
- `http_req_failed`: Tasa de fallos
- `errors`: Errores personalizados
- `health_check_duration`: Latencia de health checks
- `api_call_duration`: Latencia de llamadas a API
- `webhook_duration`: Latencia de webhooks
- `rate_limit_hits`: Veces que se activó rate limiting

## Thresholds

Los tests fallan si no se cumplen estos umbrales:

| Métrica | Umbral | Descripción |
|---------|--------|-------------|
| Error rate | < 5% | Menos del 5% de errores |
| P95 latency | < 500ms | 95% de requests bajo 500ms |
| Requests/sec | > 10 | Mínimo 10 req/s |

## Endpoints Testeados

| Endpoint | Auth | Descripción |
|----------|------|-------------|
| `/` | No | Root info |
| `/health` | No | Health check |
| `/api/leads` | No→401 | Verificar que rechaza sin auth |
| `/webhook/meta` | No | Verificación de webhook |
| `/debug-cache` | Sí | Stats del cache |
| `/api/leads` | Sí | Lista de leads |
| `/api/team-members` | Sí | Lista de equipo |

## Recomendaciones

1. **Siempre probar en staging primero** antes de producción
2. **No ejecutar durante horas pico** de uso real
3. **Monitorear Cloudflare** durante el test (puede activar protección DDoS)
4. **Guardar resultados** para comparar con futuros tests

## Resultados Esperados

Para Cloudflare Workers (plan free/paid):
- **Latency P95**: < 100ms (típico 20-50ms)
- **Throughput**: > 100 req/s fácilmente
- **Error rate**: < 0.1%

## Troubleshooting

### Rate Limiting activado
Es esperado. El sistema tiene límite de 100 req/min por IP.
Los tests cuentan cuántas veces se activa.

### Errores 522/524
Cloudflare timeout. Puede indicar:
- Supabase lento
- Worker cerca del límite de CPU

### Muchos errores de red
Verificar conexión a internet y que el servidor esté arriba:
```bash
curl https://sara-backend-staging.edson-633.workers.dev/health
```
