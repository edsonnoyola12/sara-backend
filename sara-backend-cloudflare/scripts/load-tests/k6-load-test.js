// ═══════════════════════════════════════════════════════════════════════════
// SARA Backend - Load Tests con k6
// ═══════════════════════════════════════════════════════════════════════════
// Instalación: brew install k6 (Mac) o https://k6.io/docs/getting-started/installation/
// Ejecución: k6 run scripts/load-tests/k6-load-test.js
// Con más VUs: k6 run --vus 50 --duration 60s scripts/load-tests/k6-load-test.js
// ═══════════════════════════════════════════════════════════════════════════

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════════════════

const BASE_URL = __ENV.BASE_URL || 'https://sara-backend-staging.edson-633.workers.dev';
const API_SECRET = __ENV.API_SECRET || '';

// Métricas personalizadas
const errorRate = new Rate('errors');
const healthCheckDuration = new Trend('health_check_duration');
const apiCallDuration = new Trend('api_call_duration');
const webhookDuration = new Trend('webhook_duration');
const rateLimitHits = new Counter('rate_limit_hits');

// ═══════════════════════════════════════════════════════════════════════════
// ESCENARIOS DE CARGA
// ═══════════════════════════════════════════════════════════════════════════

export const options = {
  scenarios: {
    // Escenario 1: Carga constante moderada
    constant_load: {
      executor: 'constant-vus',
      vus: 10,
      duration: '30s',
      gracefulStop: '5s',
    },
    // Escenario 2: Rampa de carga (stress test)
    ramping_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 20 },  // Subir a 20 usuarios
        { duration: '20s', target: 20 },  // Mantener 20 usuarios
        { duration: '10s', target: 50 },  // Subir a 50 usuarios
        { duration: '20s', target: 50 },  // Mantener 50 usuarios
        { duration: '10s', target: 0 },   // Bajar a 0
      ],
      gracefulStop: '5s',
      startTime: '35s', // Empieza después del primer escenario
    },
    // Escenario 3: Pico de carga (spike test)
    spike_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5s', target: 100 },  // Spike rápido a 100
        { duration: '10s', target: 100 }, // Mantener
        { duration: '5s', target: 0 },    // Bajar
      ],
      gracefulStop: '5s',
      startTime: '105s', // Empieza después del segundo escenario
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],      // 95% de requests bajo 500ms
    http_req_failed: ['rate<0.01'],        // Menos de 1% de errores
    errors: ['rate<0.05'],                  // Menos de 5% de errores custom
    health_check_duration: ['p(95)<200'],   // Health checks bajo 200ms
    api_call_duration: ['p(95)<1000'],      // API calls bajo 1s
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIONES DE TEST
// ═══════════════════════════════════════════════════════════════════════════

function testHealthEndpoints() {
  group('Health Endpoints', function () {
    // Test raíz
    let res = http.get(`${BASE_URL}/`);
    healthCheckDuration.add(res.timings.duration);
    check(res, {
      'root status 200': (r) => r.status === 200,
      'root has name': (r) => r.json('name') === 'SARA Backend',
    }) || errorRate.add(1);

    // Test health
    res = http.get(`${BASE_URL}/health`);
    healthCheckDuration.add(res.timings.duration);
    check(res, {
      'health status 200': (r) => r.status === 200,
    }) || errorRate.add(1);
  });
}

function testAuthEndpoints() {
  group('Auth Endpoints', function () {
    // Sin auth debe rechazar
    let res = http.get(`${BASE_URL}/api/leads`);
    check(res, {
      'no auth returns 401': (r) => r.status === 401,
    }) || errorRate.add(1);

    // Con auth debe funcionar (si tenemos API_SECRET)
    if (API_SECRET) {
      res = http.get(`${BASE_URL}/api/leads?api_key=${API_SECRET}`);
      apiCallDuration.add(res.timings.duration);

      if (res.status === 429) {
        rateLimitHits.add(1);
      }

      check(res, {
        'with auth returns 200 or 429': (r) => r.status === 200 || r.status === 429,
      }) || errorRate.add(1);
    }
  });
}

function testDebugEndpoints() {
  if (!API_SECRET) return;

  group('Debug Endpoints', function () {
    // Debug cache
    let res = http.get(`${BASE_URL}/debug-cache?api_key=${API_SECRET}`);
    apiCallDuration.add(res.timings.duration);

    if (res.status === 429) {
      rateLimitHits.add(1);
    }

    check(res, {
      'debug-cache returns 200 or 429': (r) => r.status === 200 || r.status === 429,
      'cache is available': (r) => r.status === 429 || r.json('cache_disponible') === true,
    }) || errorRate.add(1);
  });
}

function testWebhookEndpoint() {
  group('Webhook Endpoint', function () {
    // Verificación de webhook (GET)
    let res = http.get(`${BASE_URL}/webhook/meta?hub.mode=subscribe&hub.verify_token=invalid&hub.challenge=test123`);
    webhookDuration.add(res.timings.duration);
    check(res, {
      'webhook verify rejects invalid token': (r) => r.status === 403,
    }) || errorRate.add(1);

    // Webhook POST con payload inválido
    res = http.post(`${BASE_URL}/webhook/meta`, JSON.stringify({ invalid: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
    webhookDuration.add(res.timings.duration);
    check(res, {
      'webhook handles invalid payload': (r) => r.status === 200 || r.status === 400,
    }) || errorRate.add(1);
  });
}

function testAPIEndpoints() {
  if (!API_SECRET) return;

  group('API Endpoints', function () {
    const headers = { 'Authorization': `Bearer ${API_SECRET}` };

    // Team members
    let res = http.get(`${BASE_URL}/api/team-members`, { headers });
    apiCallDuration.add(res.timings.duration);

    if (res.status === 429) {
      rateLimitHits.add(1);
    }

    check(res, {
      'team-members returns 200 or 429': (r) => r.status === 200 || r.status === 429,
    }) || errorRate.add(1);

    // Leads
    res = http.get(`${BASE_URL}/api/leads`, { headers });
    apiCallDuration.add(res.timings.duration);

    if (res.status === 429) {
      rateLimitHits.add(1);
    }

    check(res, {
      'leads returns 200 or 429': (r) => r.status === 200 || r.status === 429,
    }) || errorRate.add(1);
  });
}

function testRateLimiting() {
  group('Rate Limiting', function () {
    // Hacer múltiples requests rápidos para probar rate limiting
    const requests = [];
    for (let i = 0; i < 10; i++) {
      requests.push(['GET', `${BASE_URL}/`, null, { tags: { name: 'rate_limit_test' } }]);
    }

    const responses = http.batch(requests);
    let rateLimited = false;

    responses.forEach((res) => {
      if (res.status === 429) {
        rateLimited = true;
        rateLimitHits.add(1);
      }
    });

    // No verificamos si se activa el rate limit, solo contamos
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIÓN PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════

export default function () {
  testHealthEndpoints();
  sleep(0.5);

  testAuthEndpoints();
  sleep(0.5);

  testDebugEndpoints();
  sleep(0.5);

  testWebhookEndpoint();
  sleep(0.5);

  testAPIEndpoints();
  sleep(0.5);

  testRateLimiting();
  sleep(1);
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════════════════

export function setup() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  SARA Backend - Load Test');
  console.log(`  URL: ${BASE_URL}`);
  console.log(`  API Secret: ${API_SECRET ? 'Configurado' : 'NO configurado'}`);
  console.log('═══════════════════════════════════════════════════════════════');

  // Verificar que el servidor responde
  const res = http.get(`${BASE_URL}/health`);
  if (res.status !== 200) {
    throw new Error(`Server not responding: ${res.status}`);
  }

  return { startTime: new Date().toISOString() };
}

export function teardown(data) {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Load Test Completed');
  console.log(`  Started: ${data.startTime}`);
  console.log(`  Ended: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════════════');
}
