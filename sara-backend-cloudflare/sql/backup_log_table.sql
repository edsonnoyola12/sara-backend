-- Tabla para registrar backups semanales a R2
-- Ejecutar en Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS backup_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fecha DATE NOT NULL,
  tipo TEXT NOT NULL, -- 'conversations' | 'leads'
  file_key TEXT NOT NULL, -- R2 key: backups/conversations/2026-02-19.jsonl
  row_count INTEGER DEFAULT 0,
  size_bytes BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backup_log_fecha ON backup_log(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_backup_log_tipo ON backup_log(tipo);
