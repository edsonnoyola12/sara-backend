-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 007: SaaS RPCs and Fixes
-- Creates signup_tenant, create_auth_user RPCs
-- Adds unique constraint for mortgage upsert
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ 1. signup_tenant RPC — Atomic tenant + admin user creation ═══
CREATE OR REPLACE FUNCTION signup_tenant(
  p_name TEXT,
  p_slug TEXT,
  p_email TEXT,
  p_password_hash TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_user_id UUID;
BEGIN
  -- Check if slug already exists
  IF EXISTS (SELECT 1 FROM tenants WHERE slug = p_slug) THEN
    RETURN jsonb_build_object('error', 'Ya existe una empresa con ese nombre');
  END IF;

  -- Check if email already exists across all tenants
  IF EXISTS (SELECT 1 FROM auth_users WHERE email = p_email) THEN
    RETURN jsonb_build_object('error', 'Este email ya tiene una cuenta');
  END IF;

  -- Create tenant
  INSERT INTO tenants (name, slug, plan, active, onboarding_step, trial_ends_at)
  VALUES (p_name, p_slug, 'free', true, 0, now() + interval '14 days')
  RETURNING id INTO v_tenant_id;

  -- Set tenant context for RLS
  PERFORM set_config('app.current_tenant', v_tenant_id::text, true);

  -- Create admin auth_user
  INSERT INTO auth_users (tenant_id, email, password_hash, role, active)
  VALUES (v_tenant_id, p_email, p_password_hash, 'admin', true)
  RETURNING id INTO v_user_id;

  -- Create team_member for the admin
  INSERT INTO team_members (tenant_id, name, phone, role, active)
  VALUES (v_tenant_id, p_name, '', 'admin', true);

  RETURN jsonb_build_object(
    'tenant_id', v_tenant_id,
    'user_id', v_user_id
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('error', 'Email o nombre de empresa ya existe');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('error', SQLERRM);
END;
$$;


-- ═══ 2. create_auth_user RPC — For invitation acceptance ═══
CREATE OR REPLACE FUNCTION create_auth_user(
  p_tenant_id UUID,
  p_email TEXT,
  p_password_hash TEXT,
  p_role TEXT DEFAULT 'vendedor'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Check if email already exists for this tenant
  IF EXISTS (SELECT 1 FROM auth_users WHERE email = p_email AND tenant_id = p_tenant_id) THEN
    RETURN jsonb_build_object('error', 'Este email ya tiene una cuenta en esta empresa');
  END IF;

  -- Set tenant context for RLS
  PERFORM set_config('app.current_tenant', p_tenant_id::text, true);

  -- Create auth_user
  INSERT INTO auth_users (tenant_id, email, password_hash, role, active)
  VALUES (p_tenant_id, p_email, p_password_hash, p_role, true)
  RETURNING id INTO v_user_id;

  -- Create team_member entry so user appears in CRM
  INSERT INTO team_members (tenant_id, name, phone, role, active)
  VALUES (p_tenant_id, split_part(p_email, '@', 1), '', p_role, true);

  RETURN jsonb_build_object('user_id', v_user_id);

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('error', 'Este email ya existe');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('error', SQLERRM);
END;
$$;


-- ═══ 3. Add unique constraint on mortgage_applications.lead_id ═══
-- First check if any duplicates exist and keep only the latest
DO $$
BEGIN
  -- Delete older duplicates if any exist
  DELETE FROM mortgage_applications a
  USING mortgage_applications b
  WHERE a.lead_id = b.lead_id
    AND a.created_at < b.created_at;

  -- Now add the constraint (if not exists)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mortgage_applications_lead_id_unique'
  ) THEN
    ALTER TABLE mortgage_applications
      ADD CONSTRAINT mortgage_applications_lead_id_unique UNIQUE (lead_id);
  END IF;
END $$;


-- ═══ 4. Add onboarding_metadata and onboarding_completed_at to tenants ═══
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'onboarding_metadata') THEN
    ALTER TABLE tenants ADD COLUMN onboarding_metadata JSONB DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'onboarding_completed_at') THEN
    ALTER TABLE tenants ADD COLUMN onboarding_completed_at TIMESTAMPTZ;
  END IF;
END $$;
