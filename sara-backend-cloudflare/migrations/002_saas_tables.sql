-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 002: SaaS Support Tables
-- Creates auth_users, billing_events, invitations, usage_metrics
-- Adds missing columns to tenants for onboarding
-- EXECUTED: 2026-03-09 via Supabase Management API
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ 1. Add missing columns to tenants ═══
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS onboarding_metadata JSONB DEFAULT '{}';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS business_hours JSONB;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS developments JSONB;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;

-- ═══ 2. auth_users table ═══
CREATE TABLE IF NOT EXISTS auth_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'vendedor',
  active BOOLEAN NOT NULL DEFAULT true,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(email, tenant_id)
);
CREATE INDEX IF NOT EXISTS idx_auth_users_tenant_id ON auth_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_auth_users_email ON auth_users(email);

-- ═══ 3. billing_events table ═══
CREATE TABLE IF NOT EXISTS billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  event_type TEXT NOT NULL,
  stripe_event_id TEXT,
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  amount_cents INTEGER DEFAULT 0,
  currency TEXT DEFAULT 'mxn',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_billing_events_tenant_id ON billing_events(tenant_id);

-- ═══ 4. invitations table ═══
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'vendedor',
  token TEXT UNIQUE NOT NULL,
  invited_by UUID,
  status TEXT DEFAULT 'pending',
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  invited_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invitations_tenant_id ON invitations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);

-- ═══ 5. usage_metrics table ═══
CREATE TABLE IF NOT EXISTS usage_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  metric TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  period TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, metric, period)
);
CREATE INDEX IF NOT EXISTS idx_usage_metrics_tenant_id ON usage_metrics(tenant_id);
CREATE INDEX IF NOT EXISTS idx_usage_metrics_lookup ON usage_metrics(tenant_id, period);

-- ═══ 6. Enable RLS on new tables ═══
ALTER TABLE auth_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON auth_users FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation ON billing_events FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation ON invitations FOR ALL USING (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation ON usage_metrics FOR ALL USING (tenant_id = current_tenant_id());

-- ═══ 7. Auto-set triggers ═══
CREATE TRIGGER trg_set_tenant_id BEFORE INSERT ON auth_users FOR EACH ROW EXECUTE FUNCTION set_tenant_id_on_insert();
CREATE TRIGGER trg_set_tenant_id BEFORE INSERT ON billing_events FOR EACH ROW EXECUTE FUNCTION set_tenant_id_on_insert();
CREATE TRIGGER trg_set_tenant_id BEFORE INSERT ON invitations FOR EACH ROW EXECUTE FUNCTION set_tenant_id_on_insert();
CREATE TRIGGER trg_set_tenant_id BEFORE INSERT ON usage_metrics FOR EACH ROW EXECUTE FUNCTION set_tenant_id_on_insert();
