-- ═══════════════════════════════════════════════════════════════════════════
-- SISTEMA DE COLA DE MENSAJES PROFESIONAL
-- Solución enterprise para mensajería confiable al equipo
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. TABLA PRINCIPAL: Cola de mensajes
CREATE TABLE IF NOT EXISTS message_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Destinatario
  team_member_id UUID NOT NULL REFERENCES team_members(id),
  team_member_phone TEXT NOT NULL,
  team_member_name TEXT,

  -- Contenido del mensaje
  message_type TEXT NOT NULL, -- 'briefing', 'recap', 'reporte_diario', 'resumen_semanal', 'notificacion', 'alerta'
  message_content TEXT NOT NULL,
  message_preview TEXT, -- Primeros 100 chars para UI

  -- Estado y ciclo de vida
  status TEXT NOT NULL DEFAULT 'queued',
  -- Estados posibles:
  -- 'queued'         - En cola, esperando envío
  -- 'template_sent'  - Template enviado, esperando respuesta
  -- 'delivered'      - Mensaje entregado exitosamente
  -- 'failed'         - Falló después de todos los reintentos
  -- 'expired'        - Expiró sin entregarse
  -- 'cancelled'      - Cancelado manualmente

  priority INTEGER DEFAULT 2, -- 1=Alta, 2=Media, 3=Baja

  -- Reintentos
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  next_retry_at TIMESTAMP WITH TIME ZONE,
  last_error TEXT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  template_sent_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE, -- Calculado según tipo de mensaje

  -- Metadatos
  metadata JSONB DEFAULT '{}'
);

-- Índices para consultas eficientes
CREATE INDEX IF NOT EXISTS idx_mq_status ON message_queue(status);
CREATE INDEX IF NOT EXISTS idx_mq_team_member ON message_queue(team_member_id);
CREATE INDEX IF NOT EXISTS idx_mq_type ON message_queue(message_type);
CREATE INDEX IF NOT EXISTS idx_mq_expires ON message_queue(expires_at) WHERE status IN ('queued', 'template_sent');
CREATE INDEX IF NOT EXISTS idx_mq_retry ON message_queue(next_retry_at) WHERE status = 'queued' AND retry_count < max_retries;

-- 2. TABLA DE AUDITORÍA: Tracking completo del ciclo de vida
CREATE TABLE IF NOT EXISTS message_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES message_queue(id),

  event TEXT NOT NULL,
  -- Eventos posibles:
  -- 'created'          - Mensaje creado en cola
  -- 'template_sent'    - Template enviado
  -- 'template_failed'  - Template falló
  -- 'direct_sent'      - Mensaje directo enviado
  -- 'direct_failed'    - Mensaje directo falló
  -- 'delivered'        - Entregado al responder
  -- 'retry_scheduled'  - Programado para reintento
  -- 'expired'          - Expiró
  -- 'cancelled'        - Cancelado

  details JSONB DEFAULT '{}',
  -- Ejemplo: { "error": "rate limit", "window_status": "closed" }

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mal_message ON message_audit_log(message_id);
CREATE INDEX IF NOT EXISTS idx_mal_event ON message_audit_log(event);
CREATE INDEX IF NOT EXISTS idx_mal_created ON message_audit_log(created_at);

-- 3. CONFIGURACIÓN DE EXPIRACIÓN POR TIPO
CREATE TABLE IF NOT EXISTS message_type_config (
  message_type TEXT PRIMARY KEY,
  expiration_hours INTEGER NOT NULL DEFAULT 24,
  priority INTEGER NOT NULL DEFAULT 2,
  description TEXT,
  template_name TEXT DEFAULT 'reactivar_equipo'
);

-- Insertar configuración por defecto
INSERT INTO message_type_config (message_type, expiration_hours, priority, description) VALUES
  ('briefing', 18, 1, 'Briefing matutino - Alta prioridad, expira antes de siguiente briefing'),
  ('recap', 18, 2, 'Recap diario - Media prioridad'),
  ('reporte_diario', 24, 2, 'Reporte diario 7PM'),
  ('resumen_semanal', 72, 3, 'Resumen semanal - Más tiempo para responder'),
  ('alerta', 6, 1, 'Alertas urgentes - Expiran rápido'),
  ('notificacion', 48, 3, 'Notificaciones generales')
ON CONFLICT (message_type) DO NOTHING;

-- 4. VISTA ÚTIL: Mensajes pendientes por team member
CREATE OR REPLACE VIEW v_pending_messages AS
SELECT
  tm.id as team_member_id,
  tm.name as team_member_name,
  tm.phone as team_member_phone,
  COUNT(mq.id) as pending_count,
  STRING_AGG(mq.message_type, ', ' ORDER BY mq.priority, mq.created_at) as pending_types,
  MIN(mq.created_at) as oldest_pending,
  MAX(mq.expires_at) as latest_expiration
FROM team_members tm
LEFT JOIN message_queue mq ON tm.id = mq.team_member_id
  AND mq.status IN ('queued', 'template_sent')
WHERE tm.active = true
GROUP BY tm.id, tm.name, tm.phone;

-- 5. FUNCIÓN: Encolar mensaje (usada desde código)
CREATE OR REPLACE FUNCTION enqueue_message(
  p_team_member_id UUID,
  p_message_type TEXT,
  p_message_content TEXT,
  p_priority INTEGER DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_config message_type_config;
  v_team_member team_members;
  v_message_id UUID;
  v_priority INTEGER;
  v_expires_at TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Obtener configuración del tipo de mensaje
  SELECT * INTO v_config FROM message_type_config WHERE message_type = p_message_type;
  IF NOT FOUND THEN
    -- Usar valores por defecto si no hay configuración
    v_config.expiration_hours := 24;
    v_config.priority := 2;
  END IF;

  -- Obtener info del team member
  SELECT * INTO v_team_member FROM team_members WHERE id = p_team_member_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team member % not found', p_team_member_id;
  END IF;

  -- Calcular prioridad y expiración
  v_priority := COALESCE(p_priority, v_config.priority);
  v_expires_at := NOW() + (v_config.expiration_hours || ' hours')::INTERVAL;

  -- Insertar mensaje en cola
  INSERT INTO message_queue (
    team_member_id,
    team_member_phone,
    team_member_name,
    message_type,
    message_content,
    message_preview,
    priority,
    expires_at
  ) VALUES (
    p_team_member_id,
    v_team_member.phone,
    v_team_member.name,
    p_message_type,
    p_message_content,
    LEFT(p_message_content, 100),
    v_priority,
    v_expires_at
  ) RETURNING id INTO v_message_id;

  -- Registrar en auditoría
  INSERT INTO message_audit_log (message_id, event, details)
  VALUES (v_message_id, 'created', jsonb_build_object(
    'type', p_message_type,
    'priority', v_priority,
    'expires_at', v_expires_at
  ));

  RETURN v_message_id;
END;
$$ LANGUAGE plpgsql;

-- 6. FUNCIÓN: Marcar mensaje como entregado
CREATE OR REPLACE FUNCTION mark_message_delivered(p_message_id UUID) RETURNS VOID AS $$
BEGIN
  UPDATE message_queue
  SET status = 'delivered', delivered_at = NOW()
  WHERE id = p_message_id AND status IN ('queued', 'template_sent');

  INSERT INTO message_audit_log (message_id, event)
  VALUES (p_message_id, 'delivered');
END;
$$ LANGUAGE plpgsql;

-- 7. FUNCIÓN: Obtener siguiente mensaje para entregar (cuando responden)
CREATE OR REPLACE FUNCTION get_next_pending_message(p_team_member_id UUID)
RETURNS TABLE (
  id UUID,
  message_type TEXT,
  message_content TEXT,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT mq.id, mq.message_type, mq.message_content, mq.created_at
  FROM message_queue mq
  WHERE mq.team_member_id = p_team_member_id
    AND mq.status IN ('queued', 'template_sent')
    AND (mq.expires_at IS NULL OR mq.expires_at > NOW())
  ORDER BY mq.priority ASC, mq.created_at ASC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- 8. FUNCIÓN: Expirar mensajes viejos (llamada por CRON)
CREATE OR REPLACE FUNCTION expire_old_messages() RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH expired AS (
    UPDATE message_queue
    SET status = 'expired'
    WHERE status IN ('queued', 'template_sent')
      AND expires_at < NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM expired;

  -- Registrar en auditoría
  INSERT INTO message_audit_log (message_id, event, details)
  SELECT id, 'expired', '{}'::jsonb
  FROM message_queue
  WHERE status = 'expired'
    AND id NOT IN (SELECT message_id FROM message_audit_log WHERE event = 'expired');

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- 9. VISTA: Dashboard de salud del sistema de mensajería
CREATE OR REPLACE VIEW v_messaging_health AS
SELECT
  (SELECT COUNT(*) FROM message_queue WHERE status = 'queued') as queued,
  (SELECT COUNT(*) FROM message_queue WHERE status = 'template_sent') as awaiting_response,
  (SELECT COUNT(*) FROM message_queue WHERE status = 'delivered' AND delivered_at > NOW() - INTERVAL '24 hours') as delivered_24h,
  (SELECT COUNT(*) FROM message_queue WHERE status = 'failed') as failed,
  (SELECT COUNT(*) FROM message_queue WHERE status = 'expired' AND expires_at > NOW() - INTERVAL '24 hours') as expired_24h,
  (SELECT AVG(EXTRACT(EPOCH FROM (delivered_at - created_at))/3600)::NUMERIC(10,2)
   FROM message_queue WHERE status = 'delivered' AND delivered_at > NOW() - INTERVAL '7 days') as avg_delivery_hours;

-- ═══════════════════════════════════════════════════════════════════════════
-- INSTRUCCIONES DE USO:
--
-- 1. Ejecutar este SQL en Supabase Dashboard → SQL Editor
--
-- 2. En el código, usar las funciones RPC:
--    - supabase.rpc('enqueue_message', { p_team_member_id, p_message_type, p_message_content })
--    - supabase.rpc('get_next_pending_message', { p_team_member_id })
--    - supabase.rpc('mark_message_delivered', { p_message_id })
--    - supabase.rpc('expire_old_messages')
--
-- 3. Para migrar mensajes existentes de notes:
--    Ver script migration_pending_to_queue.sql
-- ═══════════════════════════════════════════════════════════════════════════
