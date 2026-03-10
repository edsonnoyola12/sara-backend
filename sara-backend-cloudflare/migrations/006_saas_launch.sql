-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 006: SaaS Launch Ready
-- Phase 6: Signup, onboarding, Stripe billing, admin, invitations
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ 1. Billing Events ═══
CREATE TABLE IF NOT EXISTS billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  event_type TEXT NOT NULL,           -- checkout.completed, invoice.paid, invoice.failed, subscription.created, subscription.cancelled, subscription.updated
  stripe_event_id TEXT UNIQUE,
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'mxn',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_events_tenant_id ON billing_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_type ON billing_events(event_type);
CREATE INDEX IF NOT EXISTS idx_billing_events_stripe_event ON billing_events(stripe_event_id);

ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON billing_events FOR ALL
  USING (tenant_id = current_tenant_id());

CREATE TRIGGER trg_set_tenant_id
  BEFORE INSERT ON billing_events
  FOR EACH ROW EXECUTE FUNCTION set_tenant_id_on_insert();


-- ═══ 2. Usage Metrics ═══
CREATE TABLE IF NOT EXISTS usage_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  metric TEXT NOT NULL,               -- leads_count, messages_sent, emails_sent, sms_sent, api_calls, storage_mb
  value NUMERIC NOT NULL DEFAULT 0,
  period TEXT NOT NULL,               -- YYYY-MM
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, metric, period)
);

CREATE INDEX IF NOT EXISTS idx_usage_metrics_tenant_id ON usage_metrics(tenant_id);
CREATE INDEX IF NOT EXISTS idx_usage_metrics_period ON usage_metrics(period);
CREATE INDEX IF NOT EXISTS idx_usage_metrics_tenant_period ON usage_metrics(tenant_id, period);

ALTER TABLE usage_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON usage_metrics FOR ALL
  USING (tenant_id = current_tenant_id());

CREATE TRIGGER trg_set_tenant_id
  BEFORE INSERT ON usage_metrics
  FOR EACH ROW EXECUTE FUNCTION set_tenant_id_on_insert();


-- ═══ 3. Invitations ═══
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',  -- admin, manager, viewer
  token TEXT NOT NULL UNIQUE,
  invited_by UUID REFERENCES auth_users(id),
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, email)
);

CREATE INDEX IF NOT EXISTS idx_invitations_tenant_id ON invitations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON invitations FOR ALL
  USING (tenant_id = current_tenant_id());

CREATE TRIGGER trg_set_tenant_id
  BEFORE INSERT ON invitations
  FOR EACH ROW EXECUTE FUNCTION set_tenant_id_on_insert();


-- ═══ 4. Add onboarding and trial columns to tenants ═══
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'onboarding_step') THEN
    ALTER TABLE tenants ADD COLUMN onboarding_step INTEGER NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'trial_ends_at') THEN
    ALTER TABLE tenants ADD COLUMN trial_ends_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'active') THEN
    ALTER TABLE tenants ADD COLUMN active BOOLEAN NOT NULL DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'suspended_at') THEN
    ALTER TABLE tenants ADD COLUMN suspended_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'stripe_customer_id') THEN
    ALTER TABLE tenants ADD COLUMN stripe_customer_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'stripe_subscription_id') THEN
    ALTER TABLE tenants ADD COLUMN stripe_subscription_id TEXT;
  END IF;
END $$;
