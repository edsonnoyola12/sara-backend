-- Agregar columna de score
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS score VARCHAR(10) DEFAULT 'cold',
ADD COLUMN IF NOT EXISTS score_confidence INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS score_reasoning TEXT,
ADD COLUMN IF NOT EXISTS score_updated_at TIMESTAMP WITH TIME ZONE;

-- Indices para mejor performance
CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(score);
CREATE INDEX IF NOT EXISTS idx_leads_score_status ON leads(score, status);
