-- ═══════════════════════════════════════════════════════════════════════════
-- TABLA DE OFERTAS/COTIZACIONES
-- Ejecutar en Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Lead info
  lead_id UUID REFERENCES leads(id),

  -- Property info
  property_id UUID REFERENCES properties(id),
  property_name VARCHAR(255) NOT NULL,
  development VARCHAR(100) NOT NULL,

  -- Pricing
  list_price DECIMAL(15,2) NOT NULL,
  offered_price DECIMAL(15,2) NOT NULL,
  discount_percent DECIMAL(5,2) DEFAULT 0,
  discount_amount DECIMAL(15,2) DEFAULT 0,

  -- Status
  status VARCHAR(50) DEFAULT 'draft',
  status_history JSONB DEFAULT '[]',

  -- Dates
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,

  -- Assignment
  vendor_id UUID REFERENCES team_members(id),

  -- Notes
  notes TEXT,
  rejection_reason TEXT,

  -- Financing
  financing_type VARCHAR(50),
  down_payment_percent DECIMAL(5,2),

  -- Follow-up
  next_followup TIMESTAMPTZ,
  followup_count INTEGER DEFAULT 0
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_offers_lead ON offers(lead_id);
CREATE INDEX IF NOT EXISTS idx_offers_vendor ON offers(vendor_id);
CREATE INDEX IF NOT EXISTS idx_offers_status ON offers(status);
CREATE INDEX IF NOT EXISTS idx_offers_expires ON offers(expires_at);
CREATE INDEX IF NOT EXISTS idx_offers_created ON offers(created_at);

-- RLS Policy (allow authenticated access)
ALTER TABLE offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all access for service role" ON offers
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_offers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER offers_updated_at_trigger
  BEFORE UPDATE ON offers
  FOR EACH ROW
  EXECUTE FUNCTION update_offers_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- COMENTARIO: Estados posibles para offers.status
-- ═══════════════════════════════════════════════════════════════════════════
-- draft        → Borrador (no enviada aún)
-- sent         → Enviada al cliente
-- viewed       → Cliente la vio
-- negotiating  → En negociación
-- counter_offer→ Cliente hizo contraoferta
-- accepted     → Aceptada
-- reserved     → Apartado
-- contracted   → Contrato firmado
-- rejected     → Rechazada
-- expired      → Expirada
-- cancelled    → Cancelada
-- ═══════════════════════════════════════════════════════════════════════════
