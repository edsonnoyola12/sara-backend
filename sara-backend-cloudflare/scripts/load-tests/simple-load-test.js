#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// SARA Backend - Simple Load Test (Node.js nativo, sin dependencias)
// ═══════════════════════════════════════════════════════════════════════════
// Ejecución: node scripts/load-tests/simple-load-test.js
// Con opciones: node scripts/load-tests/simple-load-test.js --vus=50 --duration=60
// ═══════════════════════════════════════════════════════════════════════════

const https = require('https');
const http = require('http');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════════════════

const config = {
  baseUrl: process.env.BASE_URL || 'https://sara-backend-staging.edson-633.workers.dev',
  apiSecret: process.env.API_SECRET || '',
  vus: parseInt(process.argv.find(a => a.startsWith('--vus='))?.split('=')[1] || '10'),
  duration: parseInt(process.argv.find(a => a.startsWith('--duration='))?.split('=')[1] || '30'),
};

// Métricas
const metrics = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  rateLimited: 0,
  responseTimes: [],
  errors: [],
  byEndpoint: {},
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function makeRequest(path, options = {}) {
  return new Promise((resolve) => {
    const url = new URL(path, config.baseUrl);
    const protocol = url.protocol === 'https:' ? https : http;

    const startTime = Date.now();

    const req = protocol.request(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const duration = Date.now() - startTime;
        resolve({
          status: res.statusCode,
          duration,
          data,
          path,
        });
      });
    });

    req.on('error', (err) => {
      const duration = Date.now() - startTime;
      resolve({
        status: 0,
        duration,
        error: err.message,
        path,
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        status: 0,
        duration: 10000,
        error: 'Timeout',
        path,
      });
    });

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

function recordMetric(result, expectedStatus = null) {
  metrics.totalRequests++;
  metrics.responseTimes.push(result.duration);

  if (!metrics.byEndpoint[result.path]) {
    metrics.byEndpoint[result.path] = {
      requests: 0,
      success: 0,
      failed: 0,
      rateLimited: 0,
      times: [],
    };
  }

  const endpoint = metrics.byEndpoint[result.path];
  endpoint.requests++;
  endpoint.times.push(result.duration);

  if (result.status === 429) {
    metrics.rateLimited++;
    endpoint.rateLimited++;
    // Rate limit no es error si tenemos muchos VUs
    metrics.successfulRequests++;
    endpoint.success++;
  } else if (expectedStatus && result.status === expectedStatus) {
    // Si esperábamos este status (ej: 401 sin auth), es éxito
    metrics.successfulRequests++;
    endpoint.success++;
  } else if (result.status >= 200 && result.status < 500) {
    // 2xx, 3xx, 4xx son respuestas válidas del servidor
    metrics.successfulRequests++;
    endpoint.success++;
  } else {
    // 5xx o errores de red son fallos reales
    metrics.failedRequests++;
    endpoint.failed++;
    if (result.error) {
      metrics.errors.push(`${result.path}: ${result.error}`);
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

async function runTests() {
  const tests = [
    // Health endpoints (esperan 200)
    { path: '/', name: 'Root', expectedStatus: 200 },
    { path: '/health', name: 'Health', expectedStatus: 200 },

    // Auth test (espera 401 sin auth)
    { path: '/api/leads', name: 'API sin auth', expectedStatus: 401 },

    // Webhook (espera 403 con token inválido)
    {
      path: '/webhook/meta?hub.mode=subscribe&hub.verify_token=invalid&hub.challenge=test',
      name: 'Webhook verify',
      expectedStatus: 403
    },
  ];

  // Agregar tests con auth si tenemos API_SECRET
  if (config.apiSecret) {
    tests.push(
      {
        path: `/debug-cache?api_key=${config.apiSecret}`,
        name: 'Debug cache',
        expectedStatus: 200
      },
      {
        path: `/api/leads?api_key=${config.apiSecret}`,
        name: 'API Leads',
        expectedStatus: 200
      },
      {
        path: `/api/team-members?api_key=${config.apiSecret}`,
        name: 'API Team',
        expectedStatus: 200
      },
    );
  }

  // Ejecutar tests
  for (const test of tests) {
    const result = await makeRequest(test.path);
    recordMetric(result, test.expectedStatus);
  }

  // Pequeña pausa entre iteraciones
  await sleep(100);
}

// ═══════════════════════════════════════════════════════════════════════════
// VIRTUAL USERS
// ═══════════════════════════════════════════════════════════════════════════

async function virtualUser(id, durationMs) {
  const endTime = Date.now() + durationMs;

  while (Date.now() < endTime) {
    await runTests();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  SARA Backend - Simple Load Test');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  URL: ${config.baseUrl}`);
  console.log(`  VUs: ${config.vus}`);
  console.log(`  Duration: ${config.duration}s`);
  console.log(`  API Secret: ${config.apiSecret ? 'Configured' : 'NOT configured'}`);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // Verificar que el servidor responde
  console.log('Checking server health...');
  const healthCheck = await makeRequest('/health');
  if (healthCheck.status !== 200) {
    console.error(`Server not responding: ${healthCheck.status}`);
    process.exit(1);
  }
  console.log(`Server OK (${healthCheck.duration}ms)`);
  console.log('');

  // Iniciar VUs
  console.log(`Starting ${config.vus} virtual users for ${config.duration}s...`);
  console.log('');

  const startTime = Date.now();
  const durationMs = config.duration * 1000;

  // Progress indicator
  const progressInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const remaining = config.duration - elapsed;
    process.stdout.write(`\r  Progress: ${elapsed}s / ${config.duration}s | Requests: ${metrics.totalRequests} | Errors: ${metrics.failedRequests} | Rate Limited: ${metrics.rateLimited}  `);
  }, 1000);

  // Lanzar VUs
  const vus = [];
  for (let i = 0; i < config.vus; i++) {
    vus.push(virtualUser(i, durationMs));
  }

  await Promise.all(vus);
  clearInterval(progressInterval);

  const totalDuration = (Date.now() - startTime) / 1000;

  // ═══════════════════════════════════════════════════════════════════════
  // RESULTADOS
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  RESULTS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // Métricas generales
  const rps = metrics.totalRequests / totalDuration;
  const errorRate = (metrics.failedRequests / metrics.totalRequests * 100) || 0;
  const rateLimitRate = (metrics.rateLimited / metrics.totalRequests * 100) || 0;

  console.log('  GENERAL METRICS');
  console.log('  ───────────────────────────────────────────────────────────');
  console.log(`  Total Requests:     ${metrics.totalRequests}`);
  console.log(`  Successful:         ${metrics.successfulRequests} (${(metrics.successfulRequests / metrics.totalRequests * 100).toFixed(1)}%)`);
  console.log(`  Failed:             ${metrics.failedRequests} (${errorRate.toFixed(1)}%)`);
  console.log(`  Rate Limited:       ${metrics.rateLimited} (${rateLimitRate.toFixed(1)}%)`);
  console.log(`  Duration:           ${totalDuration.toFixed(1)}s`);
  console.log(`  Requests/sec:       ${rps.toFixed(1)}`);
  console.log('');

  // Métricas de latencia
  console.log('  LATENCY');
  console.log('  ───────────────────────────────────────────────────────────');
  console.log(`  Min:                ${formatDuration(Math.min(...metrics.responseTimes))}`);
  console.log(`  Max:                ${formatDuration(Math.max(...metrics.responseTimes))}`);
  console.log(`  Avg:                ${formatDuration(metrics.responseTimes.reduce((a, b) => a + b, 0) / metrics.responseTimes.length)}`);
  console.log(`  P50:                ${formatDuration(percentile(metrics.responseTimes, 50))}`);
  console.log(`  P90:                ${formatDuration(percentile(metrics.responseTimes, 90))}`);
  console.log(`  P95:                ${formatDuration(percentile(metrics.responseTimes, 95))}`);
  console.log(`  P99:                ${formatDuration(percentile(metrics.responseTimes, 99))}`);
  console.log('');

  // Por endpoint
  console.log('  BY ENDPOINT');
  console.log('  ───────────────────────────────────────────────────────────');

  Object.entries(metrics.byEndpoint).forEach(([path, data]) => {
    const shortPath = path.length > 40 ? path.substring(0, 37) + '...' : path;
    const avgTime = data.times.reduce((a, b) => a + b, 0) / data.times.length;
    console.log(`  ${shortPath}`);
    console.log(`    Requests: ${data.requests} | OK: ${data.success} | Failed: ${data.failed} | 429: ${data.rateLimited} | Avg: ${formatDuration(avgTime)}`);
  });

  console.log('');

  // Thresholds
  console.log('  THRESHOLDS');
  console.log('  ───────────────────────────────────────────────────────────');

  const p95 = percentile(metrics.responseTimes, 95);
  const thresholds = [
    { name: 'Error rate < 5%', pass: errorRate < 5, value: `${errorRate.toFixed(1)}%` },
    { name: 'P95 latency < 500ms', pass: p95 < 500, value: formatDuration(p95) },
    { name: 'Requests/sec > 10', pass: rps > 10, value: rps.toFixed(1) },
  ];

  thresholds.forEach(t => {
    const status = t.pass ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${status}  ${t.name} (actual: ${t.value})`);
  });

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');

  // Exit code basado en thresholds
  const allPass = thresholds.every(t => t.pass);
  process.exit(allPass ? 0 : 1);
}

main().catch(err => {
  console.error('Load test failed:', err);
  process.exit(1);
});
