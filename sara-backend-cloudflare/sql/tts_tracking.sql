-- ═══════════════════════════════════════════════════════════
-- TTS TRACKING - Seguimiento de audios enviados y escuchados
-- Ejecutar en Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════

-- Tabla para trackear mensajes TTS
CREATE TABLE IF NOT EXISTS tts_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id TEXT UNIQUE NOT NULL,           -- WhatsApp message ID
  recipient_phone TEXT NOT NULL,             -- Teléfono del destinatario
  recipient_type TEXT NOT NULL,              -- 'lead' o 'team_member'
  recipient_id UUID,                         -- ID del lead o team_member
  recipient_name TEXT,                       -- Nombre para reportes

  -- Tipo de TTS
  tts_type TEXT NOT NULL,                    -- 'respuesta_larga', 'recordatorio_cita', 'alerta_lead', 'briefing', 'test'
  texto_original TEXT,                       -- Texto que se convirtió a audio
  audio_bytes INTEGER,                       -- Tamaño del audio
  duracion_estimada INTEGER,                 -- Duración en segundos

  -- Estados
  status TEXT DEFAULT 'sent',                -- sent, delivered, read/played, failed
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  played_at TIMESTAMPTZ,                     -- Cuando lo escucharon
  failed_at TIMESTAMPTZ,
  error_message TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_tts_messages_recipient ON tts_messages(recipient_phone);
CREATE INDEX IF NOT EXISTS idx_tts_messages_type ON tts_messages(tts_type);
CREATE INDEX IF NOT EXISTS idx_tts_messages_status ON tts_messages(status);
CREATE INDEX IF NOT EXISTS idx_tts_messages_sent_at ON tts_messages(sent_at DESC);

-- Vista para métricas de TTS
CREATE OR REPLACE VIEW tts_metrics AS
SELECT
  tts_type,
  COUNT(*) as total_enviados,
  COUNT(CASE WHEN status = 'delivered' OR status = 'read' THEN 1 END) as total_entregados,
  COUNT(CASE WHEN status = 'read' OR played_at IS NOT NULL THEN 1 END) as total_escuchados,
  COUNT(CASE WHEN status = 'failed' THEN 1 END) as total_fallidos,
  ROUND(
    COUNT(CASE WHEN status = 'read' OR played_at IS NOT NULL THEN 1 END)::numeric /
    NULLIF(COUNT(CASE WHEN status = 'delivered' OR status = 'read' THEN 1 END), 0) * 100,
    1
  ) as tasa_escucha_pct
FROM tts_messages
WHERE sent_at > NOW() - INTERVAL '30 days'
GROUP BY tts_type;

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_tts_messages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para updated_at
DROP TRIGGER IF EXISTS tts_messages_updated_at ON tts_messages;
CREATE TRIGGER tts_messages_updated_at
  BEFORE UPDATE ON tts_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_tts_messages_updated_at();

-- Verificar creación
SELECT 'Tabla tts_messages creada correctamente' as resultado;
