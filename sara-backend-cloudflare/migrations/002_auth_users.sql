-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 002: Auth Users Table
-- JWT-based authentication for CRM frontend
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS auth_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  team_member_id UUID REFERENCES team_members(id),
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',  -- admin, manager, viewer
  active BOOLEAN NOT NULL DEFAULT true,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(email, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_auth_users_email ON auth_users(email);
CREATE INDEX IF NOT EXISTS idx_auth_users_tenant_id ON auth_users(tenant_id);

-- Enable RLS
ALTER TABLE auth_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON auth_users FOR ALL
  USING (tenant_id = current_tenant_id());

-- Auto-set tenant_id trigger
CREATE TRIGGER trg_set_tenant_id
  BEFORE INSERT ON auth_users
  FOR EACH ROW EXECUTE FUNCTION set_tenant_id_on_insert();

-- Seed admin user for Santa Rita (password will be set via API)
-- Default password: "sara2026!" (bcrypt hash)
INSERT INTO auth_users (tenant_id, email, password_hash, role)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'admin@santarita.mx',
  -- This is a placeholder - actual password should be set via the auth API
  '$2a$10$placeholder_hash_replace_via_api',
  'admin'
) ON CONFLICT (email, tenant_id) DO NOTHING;
