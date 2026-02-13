// ═══════════════════════════════════════════════════════════════════════════
// HEALTH CHECK MODULE - Automated health monitoring with alerts
// ═══════════════════════════════════════════════════════════════════════════

import { SupabaseService } from '../services/supabase';
import { MetaWhatsAppService } from '../services/meta-whatsapp';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface HealthCheckResult {
  timestamp: string;
  allPassed: boolean;
  failedChecks: string[];
  checks: HealthCheck[];
  duration_ms: number;
}

export interface HealthCheck {
  name: string;
  passed: boolean;
  details: string;
  latency_ms?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH CHECK - Verify all external services
// ═══════════════════════════════════════════════════════════════════════════

export async function runHealthCheck(
  supabase: SupabaseService,
  env: { SARA_CACHE?: KVNamespace; META_PHONE_NUMBER_ID?: string; META_ACCESS_TOKEN?: string }
): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const checks: HealthCheck[] = [];
  const failedChecks: string[] = [];

  // 1. Supabase connectivity + data
  try {
    const t0 = Date.now();
    const { count: leadsCount, error } = await supabase.client
      .from('leads')
      .select('*', { count: 'exact', head: true });

    if (error) throw error;

    const latency = Date.now() - t0;
    checks.push({
      name: 'supabase_connectivity',
      passed: true,
      details: `${leadsCount} total leads, latency ${latency}ms`,
      latency_ms: latency
    });
  } catch (e) {
    checks.push({
      name: 'supabase_connectivity',
      passed: false,
      details: `Error: ${e instanceof Error ? e.message : String(e)}`
    });
    failedChecks.push('supabase_connectivity');
  }

  // 2. Team members check
  try {
    const { count, error } = await supabase.client
      .from('team_members')
      .select('*', { count: 'exact', head: true })
      .eq('active', true);

    if (error) throw error;

    const passed = (count || 0) > 0;
    checks.push({
      name: 'team_members',
      passed,
      details: passed ? `${count} active team members` : 'No active team members found'
    });
    if (!passed) failedChecks.push('team_members');
  } catch (e) {
    checks.push({
      name: 'team_members',
      passed: false,
      details: `Error: ${e instanceof Error ? e.message : String(e)}`
    });
    failedChecks.push('team_members');
  }

  // 3. Properties catalog check
  try {
    const { count, error } = await supabase.client
      .from('properties')
      .select('*', { count: 'exact', head: true });

    if (error) throw error;

    const passed = (count || 0) >= 30;
    checks.push({
      name: 'properties_catalog',
      passed,
      details: `${count} properties in catalog${!passed ? ' (expected 30+)' : ''}`
    });
    if (!passed) failedChecks.push('properties_catalog');
  } catch (e) {
    checks.push({
      name: 'properties_catalog',
      passed: false,
      details: `Error: ${e instanceof Error ? e.message : String(e)}`
    });
    failedChecks.push('properties_catalog');
  }

  // 4. KV Cache check
  if (env.SARA_CACHE) {
    try {
      const testKey = 'health_check_test';
      const testValue = `ok_${Date.now()}`;
      const t0 = Date.now();

      await env.SARA_CACHE.put(testKey, testValue, { expirationTtl: 60 });
      const readBack = await env.SARA_CACHE.get(testKey);
      await env.SARA_CACHE.delete(testKey);

      const latency = Date.now() - t0;
      const passed = readBack === testValue;

      checks.push({
        name: 'kv_cache',
        passed,
        details: passed ? `Read/write OK, latency ${latency}ms` : 'Write/read mismatch',
        latency_ms: latency
      });
      if (!passed) failedChecks.push('kv_cache');
    } catch (e) {
      checks.push({
        name: 'kv_cache',
        passed: false,
        details: `Error: ${e instanceof Error ? e.message : String(e)}`
      });
      failedChecks.push('kv_cache');
    }
  } else {
    checks.push({
      name: 'kv_cache',
      passed: true,
      details: 'KV not configured (optional)'
    });
  }

  // 5. Meta WhatsApp API check (validate token)
  if (env.META_PHONE_NUMBER_ID && env.META_ACCESS_TOKEN) {
    try {
      const t0 = Date.now();
      const response = await fetch(
        `https://graph.facebook.com/v21.0/${env.META_PHONE_NUMBER_ID}`,
        {
          headers: { 'Authorization': `Bearer ${env.META_ACCESS_TOKEN}` }
        }
      );
      const latency = Date.now() - t0;

      if (response.ok) {
        checks.push({
          name: 'meta_whatsapp_api',
          passed: true,
          details: `Token valid, latency ${latency}ms`,
          latency_ms: latency
        });
      } else {
        const errorBody = await response.text();
        const isTokenExpired = errorBody.includes('OAuthException') || response.status === 401;
        checks.push({
          name: 'meta_whatsapp_api',
          passed: false,
          details: isTokenExpired
            ? `TOKEN EXPIRED (status ${response.status})`
            : `API error: status ${response.status}`
        });
        failedChecks.push('meta_whatsapp_api');
      }
    } catch (e) {
      checks.push({
        name: 'meta_whatsapp_api',
        passed: false,
        details: `Error: ${e instanceof Error ? e.message : String(e)}`
      });
      failedChecks.push('meta_whatsapp_api');
    }
  } else {
    checks.push({
      name: 'meta_whatsapp_api',
      passed: false,
      details: 'META_PHONE_NUMBER_ID or META_ACCESS_TOKEN not configured'
    });
    failedChecks.push('meta_whatsapp_api');
  }

  // 6. Leads today check (basic data flow)
  try {
    const hoy = new Date().toISOString().split('T')[0];
    const { count } = await supabase.client
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', `${hoy}T00:00:00`);

    checks.push({
      name: 'leads_today',
      passed: true,
      details: `${count || 0} leads today`
    });
  } catch (e) {
    checks.push({
      name: 'leads_today',
      passed: true, // Non-critical
      details: `Could not count: ${e instanceof Error ? e.message : String(e)}`
    });
  }

  // 7. Appointments today
  try {
    const hoy = new Date().toISOString().split('T')[0];
    const { count } = await supabase.client
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('scheduled_date', hoy);

    checks.push({
      name: 'appointments_today',
      passed: true,
      details: `${count || 0} appointments today`
    });
  } catch (e) {
    checks.push({
      name: 'appointments_today',
      passed: true, // Non-critical
      details: `Could not count: ${e instanceof Error ? e.message : String(e)}`
    });
  }

  return {
    timestamp: new Date().toISOString(),
    allPassed: failedChecks.length === 0,
    failedChecks,
    checks,
    duration_ms: Date.now() - startTime
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ERROR TRACKING - Track errors in KV for rate monitoring
// ═══════════════════════════════════════════════════════════════════════════

export async function trackError(
  env: { SARA_CACHE?: KVNamespace },
  errorType: string
): Promise<void> {
  if (!env.SARA_CACHE) return;

  try {
    const now = new Date();
    // Key per hour: sara_errors:2026-02-11-14
    const hourKey = `sara_errors:${now.toISOString().slice(0, 13).replace('T', '-')}`;
    const typeKey = `sara_error_type:${errorType}:${now.toISOString().slice(0, 13).replace('T', '-')}`;

    // Increment total error counter for this hour
    const currentCount = parseInt(await env.SARA_CACHE.get(hourKey) || '0');
    await env.SARA_CACHE.put(hourKey, String(currentCount + 1), { expirationTtl: 172800 }); // 48h TTL

    // Increment type-specific counter
    const typeCount = parseInt(await env.SARA_CACHE.get(typeKey) || '0');
    await env.SARA_CACHE.put(typeKey, String(typeCount + 1), { expirationTtl: 172800 });
  } catch (e) {
    // Fail silently - error tracking itself shouldn't cause errors
    console.error('Error tracking error:', e);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ERROR RATE CHECK - Alert if too many errors
// ═══════════════════════════════════════════════════════════════════════════

export async function checkErrorRate(
  env: { SARA_CACHE?: KVNamespace }
): Promise<{ alertNeeded: boolean; errorsLastHour: number; errorsLast2Hours: number }> {
  if (!env.SARA_CACHE) return { alertNeeded: false, errorsLastHour: 0, errorsLast2Hours: 0 };

  try {
    const now = new Date();
    let totalErrors = 0;
    let errorsLastHour = 0;

    // Check last 2 hours
    for (let i = 0; i < 2; i++) {
      const checkTime = new Date(now.getTime() - i * 60 * 60 * 1000);
      const hourKey = `sara_errors:${checkTime.toISOString().slice(0, 13).replace('T', '-')}`;
      const count = parseInt(await env.SARA_CACHE.get(hourKey) || '0');
      totalErrors += count;
      if (i === 0) errorsLastHour = count;
    }

    return {
      alertNeeded: errorsLastHour > 10,
      errorsLastHour,
      errorsLast2Hours: totalErrors
    };
  } catch (e) {
    console.error('Error checking error rate:', e);
    return { alertNeeded: false, errorsLastHour: 0, errorsLast2Hours: 0 };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ERROR LOGGING - Persist errors to Supabase
// ═══════════════════════════════════════════════════════════════════════════

export async function logErrorToDB(
  supabase: SupabaseService,
  errorType: string,
  message: string,
  options?: {
    severity?: 'warning' | 'error' | 'critical';
    source?: string;
    stack?: string;
    context?: Record<string, any>;
  }
): Promise<void> {
  try {
    await supabase.client.from('error_logs').insert({
      error_type: errorType,
      severity: options?.severity || 'error',
      source: options?.source || 'unknown',
      message: message.slice(0, 500),
      stack: options?.stack?.slice(0, 1000) || null,
      context: options?.context || {}
    });
  } catch (e) {
    // Fail silently - error logging must never cause more errors
    console.error('Failed to log error to DB:', e);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DAILY ERROR DIGEST - Send summary to CEO at 7 PM
// ═══════════════════════════════════════════════════════════════════════════

export async function enviarDigestoErroresDiario(
  supabase: SupabaseService,
  meta: MetaWhatsAppService
): Promise<void> {
  try {
    const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: errors, error: queryError } = await supabase.client
      .from('error_logs')
      .select('error_type, severity, source')
      .gte('created_at', hace24h);

    if (queryError) {
      console.error('Error querying error_logs for digest:', queryError);
      return;
    }

    if (!errors || errors.length === 0) {
      console.log('📊 No errors in last 24h, skipping digest');
      return;
    }

    // Group by type and severity
    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = { critical: 0, error: 0, warning: 0 };
    const bySource: Record<string, number> = {};

    for (const err of errors) {
      byType[err.error_type] = (byType[err.error_type] || 0) + 1;
      bySeverity[err.severity] = (bySeverity[err.severity] || 0) + 1;
      const shortSource = err.source?.split(':').pop() || 'unknown';
      bySource[shortSource] = (bySource[shortSource] || 0) + 1;
    }

    let mensaje = `📊 *RESUMEN ERRORES DIARIO*\n_Últimas 24 horas_\n\n`;
    mensaje += `*Total:* ${errors.length} errores\n`;

    if (bySeverity.critical > 0) mensaje += `🔴 Críticos: ${bySeverity.critical}\n`;
    if (bySeverity.error > 0) mensaje += `🟠 Errores: ${bySeverity.error}\n`;
    if (bySeverity.warning > 0) mensaje += `🟡 Warnings: ${bySeverity.warning}\n`;

    mensaje += `\n*Por tipo:*\n`;
    for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
      mensaje += `• ${type}: ${count}\n`;
    }

    const topSources = Object.entries(bySource).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (topSources.length > 0) {
      mensaje += `\n*Top fuentes:*\n`;
      for (const [source, count] of topSources) {
        mensaje += `• ${source}: ${count}\n`;
      }
    }

    mensaje += `\n_Ver detalle en CRM_`;

    await meta.sendWhatsAppMessage(CEO_PHONE, mensaje);
    console.log(`📊 Error digest sent to CEO: ${errors.length} errors`);
  } catch (e) {
    console.error('Error sending error digest:', e);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ALERT CEO - Send WhatsApp alert with deduplication
// ═══════════════════════════════════════════════════════════════════════════

const CEO_PHONE = '5214922019052';

export async function alertarCEO(
  meta: MetaWhatsAppService,
  env: { SARA_CACHE?: KVNamespace },
  mensaje: string
): Promise<boolean> {
  try {
    // Dedup: check if we already sent an alert in the last hour
    if (env.SARA_CACHE) {
      const lastAlert = await env.SARA_CACHE.get('last_health_alert');
      if (lastAlert) {
        console.log('⏭️ Health alert already sent in the last hour, skipping');
        return false;
      }
    }

    // Send alert
    await meta.sendWhatsAppMessage(CEO_PHONE,
      `🚨 *ALERTA SISTEMA SARA*\n\n${mensaje}\n\n_Alerta automática - se silencia por 1 hora_`
    );

    // Mark alert sent (1 hour cooldown)
    if (env.SARA_CACHE) {
      await env.SARA_CACHE.put('last_health_alert', new Date().toISOString(), { expirationTtl: 3600 });
    }

    console.log('🚨 Health alert sent to CEO');
    return true;
  } catch (e) {
    console.error('Error sending health alert:', e);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CRON HEALTH CHECK - Called every 10 minutes from scheduled()
// ═══════════════════════════════════════════════════════════════════════════

export async function cronHealthCheck(
  supabase: SupabaseService,
  meta: MetaWhatsAppService,
  env: { SARA_CACHE?: KVNamespace; META_PHONE_NUMBER_ID?: string; META_ACCESS_TOKEN?: string }
): Promise<void> {
  try {
    // 1. Run health check
    const result = await runHealthCheck(supabase, env);

    if (!result.allPassed) {
      console.log(`⚠️ Health check failed: ${result.failedChecks.join(', ')}`);

      // Alert CEO about critical failures
      const criticalChecks = ['supabase_connectivity', 'meta_whatsapp_api'];
      const criticalFailures = result.failedChecks.filter(c => criticalChecks.includes(c));

      if (criticalFailures.length > 0) {
        const details = result.checks
          .filter(c => !c.passed)
          .map(c => `❌ ${c.name}: ${c.details}`)
          .join('\n');

        await alertarCEO(meta, env, `Checks fallidos:\n${details}`);

        // Persist to error_logs
        await logErrorToDB(supabase, 'health_check_failure', `Failed: ${result.failedChecks.join(', ')}`, {
          severity: 'critical',
          source: 'cron:healthCheck',
          context: {
            failedChecks: result.failedChecks,
            details: result.checks.filter(c => !c.passed).map(c => ({ name: c.name, details: c.details }))
          }
        });
      }
    } else {
      console.log(`✅ Health check passed (${result.checks.length} checks, ${result.duration_ms}ms)`);
    }

    // 2. Check error rate
    const errorRate = await checkErrorRate(env);
    if (errorRate.alertNeeded) {
      await alertarCEO(meta, env,
        `Alta tasa de errores:\n` +
        `• Última hora: ${errorRate.errorsLastHour} errores\n` +
        `• Últimas 2 horas: ${errorRate.errorsLast2Hours} errores`
      );
    }

    // 3. Store last health check result in KV
    if (env.SARA_CACHE) {
      await env.SARA_CACHE.put('last_health_check', JSON.stringify({
        timestamp: result.timestamp,
        allPassed: result.allPassed,
        failedChecks: result.failedChecks,
        duration_ms: result.duration_ms,
        checkCount: result.checks.length
      }), { expirationTtl: 1800 }); // 30 min
    }
  } catch (e) {
    console.error('❌ Error in cronHealthCheck:', e);
  }
}
