-- Tabla para cola de broadcasts masivos
CREATE TABLE IF NOT EXISTS broadcast_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Información del broadcast
  segment TEXT NOT NULL,  -- hot, warm, cold, todos, etc.
  desarrollo TEXT,        -- filtro por desarrollo (opcional)
  vendedor_id UUID,       -- filtro por vendedor (opcional)
  message_template TEXT NOT NULL,

  -- Leads pendientes (array de IDs)
  pending_lead_ids UUID[] NOT NULL DEFAULT '{}',
  sent_lead_ids UUID[] NOT NULL DEFAULT '{}',
  failed_lead_ids UUID[] NOT NULL DEFAULT '{}',

  -- Estado
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  total_leads INT NOT NULL DEFAULT 0,
  sent_count INT NOT NULL DEFAULT 0,
  error_count INT NOT NULL DEFAULT 0,

  -- Quién creó el broadcast
  created_by UUID,
  created_by_phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Para notificar al usuario cuando termine
  notify_on_complete BOOLEAN DEFAULT true
);

-- Índice para buscar broadcasts pendientes
CREATE INDEX IF NOT EXISTS idx_broadcast_queue_status ON broadcast_queue(status);
CREATE INDEX IF NOT EXISTS idx_broadcast_queue_created_at ON broadcast_queue(created_at);
