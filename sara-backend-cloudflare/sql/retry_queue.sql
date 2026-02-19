-- Retry Queue: Persists failed Meta WhatsApp messages for automatic retry
-- Execute in Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS retry_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_phone TEXT NOT NULL,
  message_type TEXT NOT NULL,        -- 'text', 'template', 'image', 'video', 'document', 'audio'
  payload JSONB NOT NULL,            -- Full payload for re-send
  context TEXT,                      -- e.g. 'sendMessage:5521234567'
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_error TEXT,
  last_attempt_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending',     -- 'pending', 'delivered', 'failed_permanent'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_rq_pending ON retry_queue(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_rq_created ON retry_queue(created_at);
