-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 003: Tasks, Tags, Notes, Custom Fields
-- Phase 3: Structured data for task management, tagging, notes, and custom fields
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ 1. Tasks table ═══
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  title TEXT NOT NULL,
  description TEXT,
  task_type TEXT NOT NULL DEFAULT 'general',  -- general, follow_up, call, visit, document, payment, other
  priority TEXT NOT NULL DEFAULT 'medium',     -- low, medium, high, urgent
  status TEXT NOT NULL DEFAULT 'pending',      -- pending, in_progress, completed, cancelled
  assigned_to UUID REFERENCES team_members(id),
  lead_id UUID REFERENCES leads(id),
  property_id UUID REFERENCES properties(id),
  due_date DATE,
  due_time TIME,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES team_members(id),
  recurrence TEXT,  -- none, daily, weekly, monthly
  parent_task_id UUID REFERENCES tasks(id),
  metadata JSONB DEFAULT '{}',
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_tenant_id ON tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_lead_id ON tasks(lead_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_status ON tasks(tenant_id, status);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tasks FOR ALL
  USING (tenant_id = current_tenant_id());

CREATE TRIGGER trg_set_tenant_id
  BEFORE INSERT ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_tenant_id_on_insert();


-- ═══ 2. Tags table ═══
CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6B7280',  -- hex color
  category TEXT NOT NULL DEFAULT 'general',  -- general, lead_status, property_type, source, priority, custom
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, name, category)
);

CREATE INDEX IF NOT EXISTS idx_tags_tenant_id ON tags(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tags_category ON tags(category);

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tags FOR ALL
  USING (tenant_id = current_tenant_id());

CREATE TRIGGER trg_set_tenant_id
  BEFORE INSERT ON tags
  FOR EACH ROW EXECUTE FUNCTION set_tenant_id_on_insert();


-- ═══ 3. Lead-Tags junction table ═══
CREATE TABLE IF NOT EXISTS lead_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES team_members(id),
  UNIQUE(lead_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_tags_tenant_id ON lead_tags(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lead_tags_lead_id ON lead_tags(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_tags_tag_id ON lead_tags(tag_id);

ALTER TABLE lead_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON lead_tags FOR ALL
  USING (tenant_id = current_tenant_id());

CREATE TRIGGER trg_set_tenant_id
  BEFORE INSERT ON lead_tags
  FOR EACH ROW EXECUTE FUNCTION set_tenant_id_on_insert();


-- ═══ 4. Lead Notes table ═══
CREATE TABLE IF NOT EXISTS lead_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  author_id UUID REFERENCES team_members(id),
  content TEXT NOT NULL,
  note_type TEXT NOT NULL DEFAULT 'manual',  -- manual, system, whatsapp, call, email, visit
  pinned BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_notes_tenant_id ON lead_notes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lead_notes_lead_id ON lead_notes(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_notes_author_id ON lead_notes(author_id);
CREATE INDEX IF NOT EXISTS idx_lead_notes_pinned ON lead_notes(pinned) WHERE pinned = true;

ALTER TABLE lead_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON lead_notes FOR ALL
  USING (tenant_id = current_tenant_id());

CREATE TRIGGER trg_set_tenant_id
  BEFORE INSERT ON lead_notes
  FOR EACH ROW EXECUTE FUNCTION set_tenant_id_on_insert();


-- ═══ 5. Custom Fields definition table ═══
CREATE TABLE IF NOT EXISTS custom_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  entity_type TEXT NOT NULL,  -- lead, property, task, team_member
  field_name TEXT NOT NULL,   -- internal name (snake_case)
  field_label TEXT NOT NULL,  -- display label
  field_type TEXT NOT NULL,   -- text, number, date, select, multiselect, boolean, url, email, phone
  options JSONB,              -- for select/multiselect: ["Option A", "Option B"]
  required BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  default_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, entity_type, field_name)
);

CREATE INDEX IF NOT EXISTS idx_custom_fields_tenant_id ON custom_fields(tenant_id);
CREATE INDEX IF NOT EXISTS idx_custom_fields_entity_type ON custom_fields(entity_type);
CREATE INDEX IF NOT EXISTS idx_custom_fields_tenant_entity ON custom_fields(tenant_id, entity_type);

ALTER TABLE custom_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON custom_fields FOR ALL
  USING (tenant_id = current_tenant_id());

CREATE TRIGGER trg_set_tenant_id
  BEFORE INSERT ON custom_fields
  FOR EACH ROW EXECUTE FUNCTION set_tenant_id_on_insert();


-- ═══ 6. Custom Field Values table ═══
CREATE TABLE IF NOT EXISTS custom_field_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  custom_field_id UUID NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL,  -- references the entity (lead, property, etc.)
  value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(custom_field_id, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_custom_field_values_tenant_id ON custom_field_values(tenant_id);
CREATE INDEX IF NOT EXISTS idx_custom_field_values_field_id ON custom_field_values(custom_field_id);
CREATE INDEX IF NOT EXISTS idx_custom_field_values_entity_id ON custom_field_values(entity_id);
CREATE INDEX IF NOT EXISTS idx_custom_field_values_field_entity ON custom_field_values(custom_field_id, entity_id);

ALTER TABLE custom_field_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON custom_field_values FOR ALL
  USING (tenant_id = current_tenant_id());

CREATE TRIGGER trg_set_tenant_id
  BEFORE INSERT ON custom_field_values
  FOR EACH ROW EXECUTE FUNCTION set_tenant_id_on_insert();


-- ═══ 7. Seed default tags for Santa Rita ═══
INSERT INTO tags (tenant_id, name, color, category) VALUES
  ('00000000-0000-0000-0000-000000000001', 'VIP', '#EF4444', 'priority'),
  ('00000000-0000-0000-0000-000000000001', 'Referido', '#8B5CF6', 'source'),
  ('00000000-0000-0000-0000-000000000001', 'Facebook', '#3B82F6', 'source'),
  ('00000000-0000-0000-0000-000000000001', 'Walk-in', '#10B981', 'source'),
  ('00000000-0000-0000-0000-000000000001', 'Llamada', '#F59E0B', 'source'),
  ('00000000-0000-0000-0000-000000000001', 'Credito Aprobado', '#22C55E', 'lead_status'),
  ('00000000-0000-0000-0000-000000000001', 'Credito Rechazado', '#EF4444', 'lead_status'),
  ('00000000-0000-0000-0000-000000000001', 'Interesado Casa', '#6366F1', 'property_type'),
  ('00000000-0000-0000-0000-000000000001', 'Interesado Terreno', '#0EA5E9', 'property_type'),
  ('00000000-0000-0000-0000-000000000001', 'Requiere Seguimiento', '#F97316', 'general')
ON CONFLICT (tenant_id, name, category) DO NOTHING;
