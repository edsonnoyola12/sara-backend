const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL || 'TU_SUPABASE_URL';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'TU_SUPABASE_KEY';

const sql = `
-- Agregar columnas de score
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS score VARCHAR(10) DEFAULT 'cold',
ADD COLUMN IF NOT EXISTS score_confidence INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS score_reasoning TEXT,
ADD COLUMN IF NOT EXISTS score_updated_at TIMESTAMP WITH TIME ZONE;

-- Indices
CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(score);
CREATE INDEX IF NOT EXISTS idx_leads_score_status ON leads(score, status);
`;

console.log('📊 Actualizando base de datos...');
console.log('⚠️  Este script requiere acceso directo a PostgreSQL.');
console.log('');
console.log('👉 OPCIÓN MÁS FÁCIL:');
console.log('');
console.log('1. Ve a: https://supabase.com/dashboard');
console.log('2. Selecciona tu proyecto');
console.log('3. Click en "SQL Editor" (sidebar izquierdo)');
console.log('4. Copia y pega este SQL:');
console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(sql);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');
console.log('5. Click en "Run" (o presiona Cmd+Enter)');
console.log('');
