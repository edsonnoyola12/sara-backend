-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 001: Multi-Tenant Foundation
-- Adds tenant_id to all tables, creates RLS policies, and seeds Santa Rita
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ 1. Create tenants table ═══
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  -- WhatsApp config
  whatsapp_phone_number_id TEXT,
  whatsapp_access_token TEXT,
  whatsapp_webhook_secret TEXT,
  whatsapp_business_id TEXT,
  -- Calendar config
  google_calendar_id TEXT,
  google_service_account_email TEXT,
  google_private_key TEXT,
  -- Retell.ai config
  retell_api_key TEXT,
  retell_agent_id TEXT,
  retell_phone_number TEXT,
  -- General config
  timezone TEXT NOT NULL DEFAULT 'America/Mexico_City',
  logo_url TEXT,
  primary_color TEXT DEFAULT '#2d5a27',
  secondary_color TEXT DEFAULT '#ffffff',
  -- Billing (Stripe)
  plan TEXT NOT NULL DEFAULT 'free',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  -- Limits (per plan)
  max_leads INTEGER DEFAULT 500,
  max_team_members INTEGER DEFAULT 10,
  max_messages_per_day INTEGER DEFAULT 1000,
  -- Status
  active BOOLEAN NOT NULL DEFAULT true,
  onboarding_step INTEGER DEFAULT 0,
  trial_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══ 2. Seed Santa Rita as tenant #1 ═══
INSERT INTO tenants (id, slug, name, timezone, plan, active)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'santa-rita',
  'Grupo Santa Rita',
  'America/Mexico_City',
  'enterprise',
  true
) ON CONFLICT (slug) DO NOTHING;

-- ═══ 3. Add tenant_id to all existing tables ═══
-- Helper: adds tenant_id column with FK, default, NOT NULL, and index
DO $$
DECLARE
  tbl TEXT;
  tables_to_alter TEXT[] := ARRAY[
    'leads', 'team_members', 'appointments', 'properties',
    'mortgage_applications', 'pending_videos', 'offers', 'surveys',
    'system_config', 'lead_activities', 'scheduled_followups',
    'monthly_goals', 'vendor_monthly_goals', 'conversation_history',
    'messages_sent', 'message_delivery_status', 'message_queue',
    'messages', 'retry_queue', 'broadcast_queue', 'broadcast_jobs',
    'campaign_logs', 'campaigns', 'marketing_campaigns',
    'call_logs', 'followup_approvals', 'followup_proposals',
    'followup_rules', 'health_checks', 'error_logs', 'sara_logs',
    'backup_log', 'event_registrations', 'events', 'activities',
    'ai_responses', 'ab_test_assignments', 'availability_schedules',
    'vendor_availability', 'lead_attributions', 'message_audit_log',
    'promotion_logs', 'promotions', 'price_history', 'reservations',
    'solicitudes_hipoteca', 'tts_messages', 'webhook_deliveries',
    'webhooks', 'documentos_broker', 'follow_ups',
    'alert_settings', 'reminder_config'
  ];
  santa_rita_id UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  FOREACH tbl IN ARRAY tables_to_alter
  LOOP
    -- Skip if table doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      RAISE NOTICE 'Table % does not exist, skipping', tbl;
      CONTINUE;
    END IF;

    -- Skip if column already exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'tenant_id') THEN
      RAISE NOTICE 'Table % already has tenant_id, skipping', tbl;
      CONTINUE;
    END IF;

    -- Add column with default (allows backfill)
    EXECUTE format('ALTER TABLE %I ADD COLUMN tenant_id UUID DEFAULT %L', tbl, santa_rita_id);

    -- Backfill existing rows
    EXECUTE format('UPDATE %I SET tenant_id = %L WHERE tenant_id IS NULL', tbl, santa_rita_id);

    -- Make NOT NULL
    EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id SET NOT NULL', tbl);

    -- Add FK constraint
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (tenant_id) REFERENCES tenants(id)', tbl, tbl || '_tenant_id_fk');

    -- Create index for tenant_id queries
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (tenant_id)', 'idx_' || tbl || '_tenant_id', tbl);

    RAISE NOTICE 'Added tenant_id to %', tbl;
  END LOOP;
END $$;

-- ═══ 4. Create set_tenant() RPC function ═══
CREATE OR REPLACE FUNCTION set_tenant(tid UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM set_config('app.current_tenant', tid::text, true);
END;
$$;

-- ═══ 5. Create helper function for RLS ═══
CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('app.current_tenant', true), '')::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid  -- Default to Santa Rita
  );
$$;

-- ═══ 6. Enable RLS and create policies on all tables ═══
DO $$
DECLARE
  tbl TEXT;
  tables_with_tenant TEXT[] := ARRAY[
    'leads', 'team_members', 'appointments', 'properties',
    'mortgage_applications', 'pending_videos', 'offers', 'surveys',
    'system_config', 'lead_activities', 'scheduled_followups',
    'monthly_goals', 'vendor_monthly_goals', 'conversation_history',
    'messages_sent', 'message_delivery_status', 'message_queue',
    'messages', 'retry_queue', 'broadcast_queue', 'broadcast_jobs',
    'campaign_logs', 'campaigns', 'marketing_campaigns',
    'call_logs', 'followup_approvals', 'followup_proposals',
    'followup_rules', 'health_checks', 'error_logs', 'sara_logs',
    'backup_log', 'event_registrations', 'events', 'activities',
    'ai_responses', 'ab_test_assignments', 'availability_schedules',
    'vendor_availability', 'lead_attributions', 'message_audit_log',
    'promotion_logs', 'promotions', 'price_history', 'reservations',
    'solicitudes_hipoteca', 'tts_messages', 'webhook_deliveries',
    'webhooks', 'documentos_broker', 'follow_ups',
    'alert_settings', 'reminder_config'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables_with_tenant
  LOOP
    -- Skip if table doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      CONTINUE;
    END IF;

    -- Skip if tenant_id column doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'tenant_id') THEN
      CONTINUE;
    END IF;

    -- Enable RLS
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);

    -- Drop existing policy if any (idempotent)
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl);

    -- Create tenant isolation policy
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I FOR ALL USING (tenant_id = current_tenant_id())',
      tbl
    );

    RAISE NOTICE 'RLS enabled for %', tbl;
  END LOOP;
END $$;

-- ═══ 7. Create trigger to auto-set tenant_id on INSERT ═══
CREATE OR REPLACE FUNCTION set_tenant_id_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := current_tenant_id();
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  tbl TEXT;
  tables_with_tenant TEXT[] := ARRAY[
    'leads', 'team_members', 'appointments', 'properties',
    'mortgage_applications', 'pending_videos', 'offers', 'surveys',
    'system_config', 'lead_activities', 'scheduled_followups',
    'monthly_goals', 'vendor_monthly_goals', 'conversation_history',
    'messages_sent', 'message_delivery_status', 'message_queue',
    'messages', 'retry_queue', 'broadcast_queue', 'broadcast_jobs',
    'campaign_logs', 'campaigns', 'marketing_campaigns',
    'call_logs', 'followup_approvals', 'followup_proposals',
    'followup_rules', 'health_checks', 'error_logs', 'sara_logs',
    'backup_log', 'event_registrations', 'events', 'activities',
    'ai_responses', 'ab_test_assignments', 'availability_schedules',
    'vendor_availability', 'lead_attributions', 'message_audit_log',
    'promotion_logs', 'promotions', 'price_history', 'reservations',
    'solicitudes_hipoteca', 'tts_messages', 'webhook_deliveries',
    'webhooks', 'documentos_broker', 'follow_ups',
    'alert_settings', 'reminder_config'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables_with_tenant
  LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'tenant_id') THEN
      CONTINUE;
    END IF;

    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_tenant_id ON %I', tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_set_tenant_id BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION set_tenant_id_on_insert()',
      tbl
    );
  END LOOP;
END $$;

-- ═══ 8. Create tenant lookup by phone_number_id ═══
CREATE OR REPLACE FUNCTION get_tenant_by_phone_number_id(phone_id TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT id FROM tenants WHERE whatsapp_phone_number_id = phone_id AND active = true LIMIT 1;
$$;

-- ═══ 9. RLS bypass for service role (Supabase service_role key bypasses RLS by default) ═══
-- No action needed: Supabase service_role already bypasses RLS.
-- The anon key respects RLS, which is what we want for tenant isolation.

-- ═══ 10. Tenants table does NOT have RLS (admin access only) ═══
-- Tenants table is accessed by service role for tenant lookup.
