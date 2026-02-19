-- Health checks table: stores results of periodic health monitor pings
CREATE TABLE IF NOT EXISTS health_checks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'healthy',  -- healthy | degraded
  supabase_ok BOOLEAN DEFAULT true,
  meta_ok BOOLEAN DEFAULT true,
  openai_ok BOOLEAN DEFAULT true,
  details JSONB DEFAULT '[]'::jsonb,       -- array of { service, ok, latency_ms, error? }
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_checks_created ON health_checks(created_at DESC);

-- Auto-cleanup: keep only last 7 days of health checks
-- Run manually or via pg_cron: DELETE FROM health_checks WHERE created_at < NOW() - INTERVAL '7 days';

-- AI responses table: logs every AI response for auditing
CREATE TABLE IF NOT EXISTS ai_responses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_phone TEXT,
  lead_message TEXT,
  ai_response TEXT,
  model_used TEXT,
  tokens_used INTEGER DEFAULT 0,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  response_time_ms INTEGER DEFAULT 0,
  intent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_responses_created ON ai_responses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_responses_phone ON ai_responses(lead_phone);

-- Auto-cleanup: keep only last 30 days of AI responses
-- Run manually or via pg_cron: DELETE FROM ai_responses WHERE created_at < NOW() - INTERVAL '30 days';
