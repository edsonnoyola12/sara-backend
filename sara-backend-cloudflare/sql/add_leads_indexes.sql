-- ============================================
-- ÍNDICES para tabla leads
-- Optimiza queries frecuentes en CRONs y servicios
-- Ejecutar en Supabase Dashboard → SQL Editor
-- ============================================

-- 1. Índice por status (usado en ~47 queries de CRONs/servicios)
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);

-- 2. Índice por assigned_to (usado en ~34 queries de vendor lookups)
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads(assigned_to);

-- 3. Índice por created_at DESC (usado en ~12 time-range queries de CRONs)
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
