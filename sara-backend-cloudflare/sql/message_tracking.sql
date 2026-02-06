-- ═══════════════════════════════════════════════════════════
-- MESSAGE TRACKING - Seguimiento de TODOS los mensajes enviados
-- Ejecutar en Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════

-- Tabla para trackear todos los mensajes
CREATE TABLE IF NOT EXISTS messages_sent (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id TEXT UNIQUE NOT NULL,           -- WhatsApp message ID
  recipient_phone TEXT NOT NULL,             -- Teléfono del destinatario
  recipient_type TEXT NOT NULL,              -- 'lead' o 'team_member'
  recipient_id UUID,                         -- ID del lead o team_member
  recipient_name TEXT,                       -- Nombre para reportes

  -- Tipo de mensaje
  message_type TEXT NOT NULL,                -- 'text', 'audio', 'image', 'video', 'template', 'buttons', 'list'
  categoria TEXT DEFAULT 'general',          -- 'respuesta_sara', 'recordatorio', 'alerta', 'broadcast', 'bridge', etc.
  contenido TEXT,                            -- Preview del mensaje (primeros 200 chars)

  -- Estados
  status TEXT DEFAULT 'sent',                -- sent, delivered, read, failed
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_message TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_messages_sent_recipient ON messages_sent(recipient_phone);
CREATE INDEX IF NOT EXISTS idx_messages_sent_type ON messages_sent(message_type);
CREATE INDEX IF NOT EXISTS idx_messages_sent_categoria ON messages_sent(categoria);
CREATE INDEX IF NOT EXISTS idx_messages_sent_status ON messages_sent(status);
CREATE INDEX IF NOT EXISTS idx_messages_sent_sent_at ON messages_sent(sent_at DESC);

-- Vista para métricas de mensajes
CREATE OR REPLACE VIEW message_metrics AS
SELECT
  message_type,
  categoria,
  COUNT(*) as total_enviados,
  COUNT(CASE WHEN status = 'delivered' OR status = 'read' THEN 1 END) as total_entregados,
  COUNT(CASE WHEN status = 'read' OR read_at IS NOT NULL THEN 1 END) as total_leidos,
  COUNT(CASE WHEN status = 'failed' THEN 1 END) as total_fallidos,
  ROUND(
    COUNT(CASE WHEN status = 'read' OR read_at IS NOT NULL THEN 1 END)::numeric /
    NULLIF(COUNT(CASE WHEN status = 'delivered' OR status = 'read' THEN 1 END), 0) * 100,
    1
  ) as tasa_lectura_pct
FROM messages_sent
WHERE sent_at > NOW() - INTERVAL '30 days'
GROUP BY message_type, categoria;

-- Función para actualizar updated_at
CREATE OR REPLACE FUNCTION update_messages_sent_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger
DROP TRIGGER IF EXISTS messages_sent_updated_at ON messages_sent;
CREATE TRIGGER messages_sent_updated_at
  BEFORE UPDATE ON messages_sent
  FOR EACH ROW
  EXECUTE FUNCTION update_messages_sent_updated_at();

-- Verificar
SELECT 'Tabla messages_sent creada correctamente' as resultado;
