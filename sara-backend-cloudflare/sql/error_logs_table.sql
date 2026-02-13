-- ═══════════════════════════════════════════════════════════
-- ERROR LOGS TABLE - Persistent error tracking
-- Ejecutar en Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS error_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Identificación del error
  error_type TEXT NOT NULL,                        -- 'fetch_error', 'cron_error', 'webhook_error', 'health_check_failure'
  severity TEXT NOT NULL DEFAULT 'error',           -- 'warning', 'error', 'critical'
  source TEXT NOT NULL,                             -- 'fetch:/webhook', 'cron:*/2', 'webhook:meta'

  -- Detalles
  message TEXT NOT NULL,                            -- Mensaje del error (truncado a 500 chars)
  stack TEXT,                                       -- Stack trace (truncado a 1000 chars)
  context JSONB DEFAULT '{}',                       -- { request_id, path, phone, cron }

  -- Resolución (para CRM)
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_resolved ON error_logs(resolved) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_error_logs_type ON error_logs(error_type);

-- Verificar
SELECT 'Tabla error_logs creada exitosamente' AS resultado;
