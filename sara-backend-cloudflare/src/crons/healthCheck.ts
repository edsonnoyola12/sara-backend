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

    // Also get today's key metrics for the status report
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayStr = todayStart.toISOString();

    const [leadsResult, citasResult, msgsResult] = await Promise.all([
      supabase.client.from('leads').select('id', { count: 'exact', head: true }).gte('created_at', todayStr),
      supabase.client.from('appointments').select('id', { count: 'exact', head: true }).gte('created_at', todayStr),
      supabase.client.from('ai_responses').select('id', { count: 'exact', head: true }).gte('created_at', todayStr),
    ]);

    const leadsHoy = leadsResult.count || 0;
    const citasHoy = citasResult.count || 0;
    const msgsHoy = msgsResult.count || 0;

    const errorCount = errors?.length || 0;

    // Build the daily status message (always send — even with 0 errors)
    let mensaje = `📊 *REPORTE DIARIO SARA*\n\n`;

    // Key metrics first
    mensaje += `*Actividad hoy:*\n`;
    mensaje += `👤 Leads nuevos: ${leadsHoy}\n`;
    mensaje += `📅 Citas creadas: ${citasHoy}\n`;
    mensaje += `💬 Mensajes IA: ${msgsHoy}\n\n`;

    if (errorCount === 0) {
      mensaje += `✅ *0 errores en 24h* — Sistema estable\n`;
    } else {
      // Group by type and severity
      const byType: Record<string, number> = {};
      const bySeverity: Record<string, number> = { critical: 0, error: 0, warning: 0 };
      const bySource: Record<string, number> = {};

      for (const err of errors!) {
        byType[err.error_type] = (byType[err.error_type] || 0) + 1;
        bySeverity[err.severity] = (bySeverity[err.severity] || 0) + 1;
        const shortSource = err.source?.split(':').pop() || 'unknown';
        bySource[shortSource] = (bySource[shortSource] || 0) + 1;
      }

      mensaje += `*Errores (${errorCount}):*\n`;
      if (bySeverity.critical > 0) mensaje += `🔴 Críticos: ${bySeverity.critical}\n`;
      if (bySeverity.error > 0) mensaje += `🟠 Errores: ${bySeverity.error}\n`;
      if (bySeverity.warning > 0) mensaje += `🟡 Warnings: ${bySeverity.warning}\n`;

      const topSources = Object.entries(bySource).sort((a, b) => b[1] - a[1]).slice(0, 3);
      if (topSources.length > 0) {
        mensaje += `\n*Top fuentes:*\n`;
        for (const [source, count] of topSources) {
          mensaje += `• ${source}: ${count}\n`;
        }
      }
    }

    mensaje += `\n_Reporte automático SARA_`;

    // Send to Edson (dev)
    await meta.sendWhatsAppMessage(DEFAULT_DEV_PHONE, mensaje);
    console.log(`📊 Daily status sent to Edson: ${errorCount} errors, ${leadsHoy} leads`);

    // Send to Oscar (CEO) — always, so he knows the system is alive
    try {
      await meta.sendWhatsAppMessage(CEO_PHONE, mensaje);
      console.log(`📊 Daily status sent to Oscar (CEO)`);
    } catch (ceoErr) {
      // If CEO window closed, use template
      try {
        const resumen = errorCount === 0
          ? `Sistema estable. ${leadsHoy} leads, ${citasHoy} citas, ${msgsHoy} msgs IA. 0 errores.`
          : `${leadsHoy} leads, ${citasHoy} citas. ${errorCount} errores (${(errors || []).filter((e: any) => e.severity === 'critical').length} críticos).`;
        await meta.sendTemplate(CEO_PHONE, 'alerta_sistema', 'es_MX', [
          { type: 'body', parameters: [{ type: 'text', text: `REPORTE DIARIO: ${resumen}` }] }
        ], true);
      } catch (tplErr) {
        console.warn('⚠️ Could not send daily status to CEO:', tplErr);
      }
    }
  } catch (e) {
    console.error('Error sending daily status:', e);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ALERT SISTEMA - Send WhatsApp alert to Edson (owner) via template
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_DEV_PHONE = '5610016226'; // Fallback if env.DEV_PHONE not set
const CEO_PHONE = '5214922019052'; // Oscar — gets critical alerts

/**
 * Envía alerta de sistema a Edson vía template (no requiere ventana 24h).
 * Template: alerta_sistema (1 parámetro body: el mensaje de alerta)
 * Fallback: si template falla, intenta mensaje directo.
 * Dedup: máximo 1 alerta por hora (configurable con dedupKey).
 */
export async function enviarAlertaSistema(
  meta: MetaWhatsAppService,
  mensaje: string,
  env?: { SARA_CACHE?: KVNamespace; DEV_PHONE?: string },
  dedupKey: string = 'last_health_alert'
): Promise<boolean> {
  const OWNER_PHONE = env?.DEV_PHONE || DEFAULT_DEV_PHONE;
  try {
    // Dedup: check if we already sent an alert in the last hour
    if (env?.SARA_CACHE && dedupKey) {
      const lastAlert = await env.SARA_CACHE.get(`alert_dedup:${dedupKey}`);
      if (lastAlert) {
        console.log(`⏭️ Alerta ${dedupKey} ya enviada en la última hora, skipping`);
        return false;
      }
    }

    // Truncar mensaje a 1000 chars (límite parámetro template)
    const mensajeTruncado = mensaje.length > 1000 ? mensaje.substring(0, 997) + '...' : mensaje;

    let sent = false;

    // Intentar con template primero (funciona sin ventana 24h)
    try {
      await meta.sendTemplate(OWNER_PHONE, 'alerta_sistema', 'es_MX', [
        { type: 'body', parameters: [{ type: 'text', text: mensajeTruncado }] }
      ], true);
      sent = true;
      console.log(`🚨 Alerta sistema enviada via template: ${mensaje.substring(0, 50)}...`);
    } catch (templateErr) {
      console.warn('⚠️ Template alerta_sistema falló, intentando mensaje directo:', templateErr);
      // Fallback: mensaje directo (solo funciona si ventana 24h abierta)
      try {
        await meta.sendWhatsAppMessage(OWNER_PHONE,
          `🚨 *ALERTA SISTEMA SARA*\n\n${mensaje}\n\n_Alerta automática_`
        );
        sent = true;
        console.log(`🚨 Alerta sistema enviada via texto directo (fallback)`);
      } catch (directErr) {
        console.error('❌ No se pudo enviar alerta ni por template ni directo:', directErr);
      }
    }

    // Mark alert sent (1 hour cooldown)
    if (sent && env?.SARA_CACHE && dedupKey) {
      await env.SARA_CACHE.put(`alert_dedup:${dedupKey}`, new Date().toISOString(), { expirationTtl: 3600 });
    }

    return sent;
  } catch (e) {
    console.error('Error sending system alert:', e);
    return false;
  }
}

// Backward compat alias
export async function alertarCEO(
  meta: MetaWhatsAppService,
  env: { SARA_CACHE?: KVNamespace },
  mensaje: string
): Promise<boolean> {
  return enviarAlertaSistema(meta, mensaje, env, 'last_health_alert');
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

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH MONITOR CRON - Ping Supabase, Meta, OpenAI every 5 min
// Saves results to health_checks table + alerts on failure
// ═══════════════════════════════════════════════════════════════════════════

export async function healthMonitorCron(
  supabase: SupabaseService,
  meta: MetaWhatsAppService,
  env: { SARA_CACHE?: KVNamespace; META_PHONE_NUMBER_ID?: string; META_ACCESS_TOKEN?: string; ANTHROPIC_API_KEY?: string; OPENAI_API_KEY?: string }
): Promise<{ supabase_ok: boolean; meta_ok: boolean; openai_ok: boolean; saved: boolean }> {
  const result = { supabase_ok: false, meta_ok: false, openai_ok: false, saved: false };
  const details: { service: string; ok: boolean; latency_ms: number; error?: string }[] = [];

  // 1. Ping Supabase (SELECT 1)
  try {
    const t0 = Date.now();
    const { error } = await supabase.client.from('leads').select('id', { count: 'exact', head: true });
    const latency = Date.now() - t0;
    result.supabase_ok = !error;
    details.push({ service: 'supabase', ok: !error, latency_ms: latency, error: error?.message });
  } catch (e: any) {
    details.push({ service: 'supabase', ok: false, latency_ms: 0, error: e?.message });
  }

  // 2. Ping Meta API (GET phone number info)
  try {
    const t0 = Date.now();
    const resp = await fetch(
      `https://graph.facebook.com/v21.0/${env.META_PHONE_NUMBER_ID}`,
      { headers: { Authorization: `Bearer ${env.META_ACCESS_TOKEN}` } }
    );
    const latency = Date.now() - t0;
    result.meta_ok = resp.ok;
    details.push({ service: 'meta', ok: resp.ok, latency_ms: latency, error: resp.ok ? undefined : `HTTP ${resp.status}` });
  } catch (e: any) {
    details.push({ service: 'meta', ok: false, latency_ms: 0, error: e?.message });
  }

  // 3. Ping OpenAI (GET /models - lightweight)
  try {
    const t0 = Date.now();
    const apiKey = env.OPENAI_API_KEY;
    if (apiKey) {
      const resp = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const latency = Date.now() - t0;
      result.openai_ok = resp.ok;
      details.push({ service: 'openai', ok: resp.ok, latency_ms: latency, error: resp.ok ? undefined : `HTTP ${resp.status}` });
    } else {
      // No OpenAI key configured - skip (not critical)
      result.openai_ok = true;
      details.push({ service: 'openai', ok: true, latency_ms: 0, error: 'no key configured (skipped)' });
    }
  } catch (e: any) {
    details.push({ service: 'openai', ok: false, latency_ms: 0, error: e?.message });
  }

  // 4. Calculate percentiles from last 100 health checks
  let percentiles: { p50: number; p95: number; p99: number } | null = null;
  try {
    const { data: recentChecks } = await supabase.client
      .from('health_checks')
      .select('details')
      .order('created_at', { ascending: false })
      .limit(100);

    if (recentChecks && recentChecks.length >= 5) {
      const supabaseLatencies: number[] = [];
      const metaLatencies: number[] = [];
      for (const check of recentChecks) {
        const dets = check.details?.services || check.details || [];
        if (!Array.isArray(dets)) continue;
        for (const d of dets) {
          if (d.service === 'supabase' && d.ok && d.latency_ms > 0) supabaseLatencies.push(d.latency_ms);
          if (d.service === 'meta' && d.ok && d.latency_ms > 0) metaLatencies.push(d.latency_ms);
        }
      }
      // Use supabase latencies for percentile calculation (primary service)
      const allLatencies = [...supabaseLatencies, ...metaLatencies].sort((a, b) => a - b);
      if (allLatencies.length >= 5) {
        percentiles = {
          p50: allLatencies[Math.floor(allLatencies.length * 0.50)],
          p95: allLatencies[Math.floor(allLatencies.length * 0.95)],
          p99: allLatencies[Math.floor(allLatencies.length * 0.99)],
        };
      }
    }
  } catch (e) {
    console.warn('⚠️ Could not calculate percentiles:', e);
  }

  // 5. Get token usage today
  let tokenUsageToday: { total: number; input: number; output: number; count: number } | null = null;
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data: aiData } = await supabase.client
      .from('ai_responses')
      .select('tokens_used, input_tokens, output_tokens, response_time_ms')
      .gte('created_at', todayStart.toISOString());

    if (aiData && aiData.length > 0) {
      tokenUsageToday = {
        total: aiData.reduce((sum: number, r: any) => sum + (r.tokens_used || 0), 0),
        input: aiData.reduce((sum: number, r: any) => sum + (r.input_tokens || 0), 0),
        output: aiData.reduce((sum: number, r: any) => sum + (r.output_tokens || 0), 0),
        count: aiData.length,
      };
    }
  } catch (e) {
    console.warn('⚠️ Could not get token usage:', e);
  }

  // 6. Compute avg response time from today's AI responses
  let avgResponseTimeMs: number | null = null;
  if (tokenUsageToday && tokenUsageToday.count > 0) {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { data: aiTiming } = await supabase.client
        .from('ai_responses')
        .select('response_time_ms')
        .gte('created_at', todayStart.toISOString())
        .not('response_time_ms', 'is', null);

      if (aiTiming && aiTiming.length > 0) {
        const totalMs = aiTiming.reduce((sum: number, r: any) => sum + (r.response_time_ms || 0), 0);
        avgResponseTimeMs = Math.round(totalMs / aiTiming.length);
      }
    } catch (e) {
      // Ignore - non-critical
    }
  }

  // 7. Save to health_checks table with enhanced details
  try {
    const allOk = result.supabase_ok && result.meta_ok && result.openai_ok;
    const enhancedDetails: any = {
      services: details,
      ...(percentiles && { percentiles }),
      ...(tokenUsageToday && { token_usage_today: tokenUsageToday }),
      ...(avgResponseTimeMs !== null && { avg_response_time_ms: avgResponseTimeMs }),
    };
    await supabase.client.from('health_checks').insert({
      status: allOk ? 'healthy' : 'degraded',
      supabase_ok: result.supabase_ok,
      meta_ok: result.meta_ok,
      openai_ok: result.openai_ok,
      details: enhancedDetails,
    });
    result.saved = true;
  } catch (e) {
    console.warn('⚠️ Could not save health check to DB:', e);
  }

  // 8. Alert on failure
  const failedServices = details.filter(d => !d.ok).map(d => d.service);
  if (failedServices.length > 0) {
    const detailStr = details.map(d => `${d.ok ? '✅' : '❌'} ${d.service}: ${d.ok ? `${d.latency_ms}ms` : d.error}`).join('\n');
    await enviarAlertaSistema(
      meta,
      `🚨 HEALTH MONITOR\n\nServicios caídos: ${failedServices.join(', ')}\n\n${detailStr}`,
      env,
      `health_monitor_${failedServices.join('_')}`
    );
  }

  // 9. Latency alerts (p95 thresholds)
  if (percentiles) {
    const supLatency = details.find(d => d.service === 'supabase');
    const metaLatency = details.find(d => d.service === 'meta');
    if (supLatency && supLatency.ok && supLatency.latency_ms > 5000) {
      await enviarAlertaSistema(
        meta,
        `⚠️ LATENCIA ALTA SUPABASE\n\nLatencia actual: ${supLatency.latency_ms}ms\nP95: ${percentiles.p95}ms\nUmbral: 5000ms`,
        env,
        'latency_supabase_high'
      );
    }
    if (metaLatency && metaLatency.ok && metaLatency.latency_ms > 3000) {
      await enviarAlertaSistema(
        meta,
        `⚠️ LATENCIA ALTA META API\n\nLatencia actual: ${metaLatency.latency_ms}ms\nP95: ${percentiles.p95}ms\nUmbral: 3000ms`,
        env,
        'latency_meta_high'
      );
    }
  }

  console.log(`🏥 Health monitor: supabase=${result.supabase_ok} meta=${result.meta_ok} openai=${result.openai_ok}`);
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// GET LAST HEALTH CHECK - For CEO "status" command
// ═══════════════════════════════════════════════════════════════════════════

export async function getLastHealthCheck(
  supabase: SupabaseService
): Promise<string> {
  try {
    const { data } = await supabase.client
      .from('health_checks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) return '⚠️ No hay health checks registrados aún.';

    const ts = new Date(data.created_at);
    const minutesAgo = Math.round((Date.now() - ts.getTime()) / 60000);
    const details = data.details?.services || data.details || [];

    let msg = `🏥 *STATUS DEL SISTEMA*\n\n`;
    msg += `Estado: ${data.status === 'healthy' ? '✅ SALUDABLE' : '⚠️ DEGRADADO'}\n`;
    msg += `Última verificación: hace ${minutesAgo} min\n\n`;
    msg += `*Servicios:*\n`;
    msg += `${data.supabase_ok ? '✅' : '❌'} Supabase (BD)`;
    const supDetail = details.find((d: any) => d.service === 'supabase');
    if (supDetail) msg += ` — ${supDetail.latency_ms}ms`;
    msg += '\n';
    msg += `${data.meta_ok ? '✅' : '❌'} Meta (WhatsApp)`;
    const metaDetail = details.find((d: any) => d.service === 'meta');
    if (metaDetail) msg += ` — ${metaDetail.latency_ms}ms`;
    msg += '\n';
    msg += `${data.openai_ok ? '✅' : '❌'} OpenAI (TTS)`;
    const oaiDetail = details.find((d: any) => d.service === 'openai');
    if (oaiDetail && oaiDetail.latency_ms > 0) msg += ` — ${oaiDetail.latency_ms}ms`;
    msg += '\n';

    return msg;
  } catch (e) {
    console.error('❌ Error in getLastHealthCheck:', e);
    return '❌ Error consultando health checks.';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GET LAST AI RESPONSES - For CEO "respuestas" command
// ═══════════════════════════════════════════════════════════════════════════

export async function getLastAIResponses(
  supabase: SupabaseService,
  limit: number = 10
): Promise<string> {
  try {
    const { data } = await supabase.client
      .from('ai_responses')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!data || data.length === 0) return '⚠️ No hay respuestas de IA registradas aún.';

    let msg = `🤖 *ÚLTIMAS ${data.length} RESPUESTAS DE SARA*\n\n`;

    for (const r of data) {
      const ts = new Date(r.created_at);
      const hora = ts.toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit' });
      const phone = r.lead_phone ? `...${r.lead_phone.slice(-4)}` : '??';
      const leadMsg = (r.lead_message || '').substring(0, 60);
      const aiResp = (r.ai_response || '').substring(0, 80);
      const tokens = r.tokens_used || 0;
      const timeMs = r.response_time_ms || 0;

      msg += `*${hora}* | ${phone} | ${timeMs}ms | ${tokens} tok\n`;
      msg += `📩 ${leadMsg}${leadMsg.length >= 60 ? '...' : ''}\n`;
      msg += `🤖 ${aiResp}${aiResp.length >= 80 ? '...' : ''}\n\n`;
    }

    return msg;
  } catch (e) {
    return '❌ Error consultando respuestas de IA.';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MORNING PIPELINE PROBE - Synthetic test at 8:05 AM daily
// Verifies the ENTIRE lead pipeline is working (not just connectivity)
// ═══════════════════════════════════════════════════════════════════════════

export async function morningPipelineProbe(
  supabase: SupabaseService,
  meta: MetaWhatsAppService,
  env: { SARA_CACHE?: KVNamespace; ANTHROPIC_API_KEY?: string; META_PHONE_NUMBER_ID?: string; META_ACCESS_TOKEN?: string }
): Promise<void> {
  const startTime = Date.now();
  const checks: { name: string; ok: boolean; detail: string; ms: number }[] = [];

  const runCheck = async (name: string, fn: () => Promise<string>) => {
    const t0 = Date.now();
    try {
      const detail = await fn();
      checks.push({ name, ok: true, detail, ms: Date.now() - t0 });
    } catch (e: any) {
      checks.push({ name, ok: false, detail: e?.message || String(e), ms: Date.now() - t0 });
    }
  };

  // 1. DB: Can we read leads?
  await runCheck('DB Leads', async () => {
    const { count, error } = await supabase.client.from('leads').select('id', { count: 'exact', head: true });
    if (error) throw new Error(error.message);
    return `${count} leads en DB`;
  });

  // 2. DB: Can we read team_members?
  await runCheck('DB Team', async () => {
    const { data, error } = await supabase.client.from('team_members').select('id, name').eq('active', true);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) throw new Error('0 team members activos');
    return `${data.length} activos`;
  });

  // 3. DB: Can we write? (create and delete a test lead)
  await runCheck('DB Write', async () => {
    const testPhone = `probe_${Date.now()}`;
    const { data, error: insertErr } = await supabase.client
      .from('leads')
      .insert({ phone: testPhone, status: 'new', score: 0, name: 'PROBE_TEST' })
      .select('id')
      .single();
    if (insertErr) throw new Error(`Insert: ${insertErr.message}`);
    // Clean up
    if (data?.id) {
      await supabase.client.from('leads').delete().eq('id', data.id);
    }
    return 'Insert+Delete OK';
  });

  // 4. KV: Can we read/write?
  await runCheck('KV Cache', async () => {
    if (!env.SARA_CACHE) throw new Error('KV not available');
    const testKey = `probe_test_${Date.now()}`;
    await env.SARA_CACHE.put(testKey, 'ok', { expirationTtl: 60 });
    const val = await env.SARA_CACHE.get(testKey);
    if (val !== 'ok') throw new Error('KV read mismatch');
    await env.SARA_CACHE.delete(testKey);
    return 'Read/Write OK';
  });

  // 5. Meta API: Is our token valid?
  await runCheck('Meta API', async () => {
    const resp = await fetch(
      `https://graph.facebook.com/v21.0/${env.META_PHONE_NUMBER_ID}?fields=verified_name,quality_rating`,
      { headers: { Authorization: `Bearer ${env.META_ACCESS_TOKEN}` } }
    );
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data: any = await resp.json();
    return `${data.verified_name || 'OK'} (quality: ${data.quality_rating || 'N/A'})`;
  });

  // 6. Properties: Are prices sane?
  await runCheck('Precios', async () => {
    const { data, error } = await supabase.client.from('properties').select('name, price').gt('price', 0);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) throw new Error('0 propiedades con precio');
    const minPrice = Math.min(...data.map(p => p.price));
    const maxPrice = Math.max(...data.map(p => p.price));
    if (minPrice < 100000) throw new Error(`Precio sospechoso: $${minPrice}`);
    return `${data.length} propiedades ($${(minPrice/1e6).toFixed(1)}M - $${(maxPrice/1e6).toFixed(1)}M)`;
  });

  // 7. Recent errors check
  await runCheck('Errores 1h', async () => {
    const hace1h = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase.client
      .from('error_logs')
      .select('severity')
      .gte('created_at', hace1h);
    if (error) throw new Error(error.message);
    const criticals = (data || []).filter(e => e.severity === 'critical').length;
    if (criticals > 3) throw new Error(`${criticals} errores críticos en última hora`);
    return `${data?.length || 0} errores (${criticals} críticos)`;
  });

  // 8. Stuck pending messages (team members with pending > 2h old)
  await runCheck('Pending msgs', async () => {
    const hace2h = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase.client
      .from('team_members')
      .select('name, notes')
      .eq('active', true);
    let stuck = 0;
    for (const tm of (data || [])) {
      const notes = typeof tm.notes === 'object' ? tm.notes : {};
      for (const key of Object.keys(notes as any)) {
        if (key.startsWith('pending_') && (notes as any)[key]?.sent_at) {
          if ((notes as any)[key].sent_at < hace2h) stuck++;
        }
      }
    }
    if (stuck > 5) throw new Error(`${stuck} mensajes pending > 2h`);
    return stuck > 0 ? `${stuck} pending (< 2h OK)` : '0 stuck';
  });

  // Build result
  const totalMs = Date.now() - startTime;
  const failed = checks.filter(c => !c.ok);
  const allOk = failed.length === 0;

  // Build the status message
  let mensaje = allOk
    ? `✅ *SARA PIPELINE OK* (${totalMs}ms)\n\n`
    : `🚨 *SARA PIPELINE PROBLEMAS* (${failed.length} fallas)\n\n`;

  for (const c of checks) {
    mensaje += `${c.ok ? '✅' : '❌'} ${c.name}: ${c.detail} (${c.ms}ms)\n`;
  }

  mensaje += `\n_Probe automático ${new Date().toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit' })}_`;

  // Always send to Edson
  try {
    await meta.sendWhatsAppMessage(DEFAULT_DEV_PHONE, mensaje);
  } catch {
    try {
      await meta.sendTemplate(DEFAULT_DEV_PHONE, 'alerta_sistema', 'es_MX', [
        { type: 'body', parameters: [{ type: 'text', text: allOk ? 'Pipeline OK' : `PROBLEMAS: ${failed.map(f => f.name).join(', ')}` }] }
      ], true);
    } catch { /* last resort failed */ }
  }

  // Alert CEO only if something failed
  if (!allOk) {
    const alertMsg = `🚨 SARA tiene problemas:\n${failed.map(f => `❌ ${f.name}: ${f.detail}`).join('\n')}`;
    await enviarAlertaSistema(meta, alertMsg, env, 'pipeline_probe_alert');
    // Also directly to Oscar
    try {
      await meta.sendTemplate(CEO_PHONE, 'alerta_sistema', 'es_MX', [
        { type: 'body', parameters: [{ type: 'text', text: alertMsg.substring(0, 1000) }] }
      ], true);
    } catch { /* template might fail */ }
  }

  console.log(`🔍 Pipeline probe: ${allOk ? 'ALL OK' : `${failed.length} FAILED`} (${totalMs}ms)`);
}

// ═══════════════════════════════════════════════════════════════════════════
// REAL-TIME CRITICAL ERROR ALERT - Call from main error handler
// Sends immediate WhatsApp to CEO+Dev when critical errors spike
// ═══════════════════════════════════════════════════════════════════════════

export async function alertOnCriticalError(
  supabase: SupabaseService,
  meta: MetaWhatsAppService,
  env: { SARA_CACHE?: KVNamespace },
  errorType: string,
  errorMessage: string,
  source: string
): Promise<void> {
  try {
    // Only alert on truly critical errors (not warnings)
    if (!env.SARA_CACHE) return;

    // Increment error counter for this hour
    const hourKey = `error_count:${new Date().toISOString().slice(0, 13)}`;
    const currentStr = await env.SARA_CACHE.get(hourKey);
    const current = currentStr ? parseInt(currentStr) : 0;
    await env.SARA_CACHE.put(hourKey, String(current + 1), { expirationTtl: 7200 });

    // Alert if error rate exceeds threshold (>5 errors in 1 hour)
    if (current + 1 >= 5) {
      const dedupKey = `error_rate_alert:${new Date().toISOString().slice(0, 13)}`;
      const alreadySent = await env.SARA_CACHE.get(dedupKey);
      if (!alreadySent) {
        await env.SARA_CACHE.put(dedupKey, '1', { expirationTtl: 3600 });
        const alertMsg = `🚨 *TASA DE ERRORES ALTA*\n\n${current + 1} errores en la última hora\nÚltimo: ${errorType} en ${source}\n${errorMessage.substring(0, 200)}`;
        await enviarAlertaSistema(meta, alertMsg, env, 'error_rate_spike');
      }
    }
  } catch {
    // Never let error alerting itself cause errors
  }
}
