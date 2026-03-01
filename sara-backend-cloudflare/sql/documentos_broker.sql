-- ============================================
-- TABLA: documentos_broker
-- Tracking de documentos hipotecarios enviados por leads
-- Usado por BrokerHipotecarioService
-- ============================================

CREATE TABLE IF NOT EXISTS documentos_broker (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,               -- ine_frente, ine_reverso, nomina, comprobante_domicilio
  media_url TEXT,                    -- URL o data URL del documento
  datos_extraidos JSONB,            -- Datos extraídos por Vision API (nombre, CURP, etc.)
  valido BOOLEAN DEFAULT true,      -- Si el documento es legible y válido
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_documentos_broker_lead_id ON documentos_broker(lead_id);
CREATE INDEX IF NOT EXISTS idx_documentos_broker_tipo ON documentos_broker(tipo);
CREATE INDEX IF NOT EXISTS idx_documentos_broker_lead_tipo ON documentos_broker(lead_id, tipo);
