-- ═══════════════════════════════════════════════════════════════════════════
-- CALL LOGS TABLE - Registro de llamadas telefónicas con IA (Retell.ai)
-- ═══════════════════════════════════════════════════════════════════════════
-- Ejecutar en Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- Crear tabla call_logs
CREATE TABLE IF NOT EXISTS call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id TEXT UNIQUE NOT NULL,           -- ID único de Retell.ai
  lead_id UUID REFERENCES leads(id),       -- Lead al que se llamó
  lead_phone TEXT,                         -- Teléfono del lead
  vendor_id UUID REFERENCES team_members(id), -- Vendedor que solicitó la llamada
  duration_seconds INTEGER,                -- Duración en segundos
  transcript JSONB,                        -- Transcripción completa (array de {role, content})
  summary TEXT,                            -- Resumen generado por IA
  sentiment TEXT CHECK (sentiment IN ('positive', 'negative', 'neutral')),
  outcome TEXT,                            -- Resultado: successful, no_answer, busy, failed
  metadata JSONB,                          -- Datos adicionales de Retell
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_call_logs_lead_id ON call_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_vendor_id ON call_logs(vendor_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_created_at ON call_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_sentiment ON call_logs(sentiment);

-- Comentarios de documentación
COMMENT ON TABLE call_logs IS 'Registro de llamadas telefónicas realizadas por SARA via Retell.ai';
COMMENT ON COLUMN call_logs.call_id IS 'ID único de la llamada en Retell.ai';
COMMENT ON COLUMN call_logs.transcript IS 'Transcripción como array de objetos {role: agent|user, content: string}';
COMMENT ON COLUMN call_logs.sentiment IS 'Análisis de sentimiento: positive, negative, neutral';
COMMENT ON COLUMN call_logs.outcome IS 'Resultado de la llamada: successful, no_answer, busy, failed';

-- Trigger para actualizar updated_at (opcional)
-- CREATE OR REPLACE FUNCTION update_updated_at_column()
-- RETURNS TRIGGER AS $$
-- BEGIN
--   NEW.updated_at = NOW();
--   RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql;

-- CREATE TRIGGER update_call_logs_updated_at
--   BEFORE UPDATE ON call_logs
--   FOR EACH ROW
--   EXECUTE FUNCTION update_updated_at_column();

-- Verificar creación
SELECT 'call_logs table created successfully' AS status;
