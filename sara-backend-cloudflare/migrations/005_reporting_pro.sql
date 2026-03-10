-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 005: Reporting PRO
-- Phase 5: Custom report builder, forecasting, scheduled reports
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ 1. Saved Reports ═══
CREATE TABLE IF NOT EXISTS saved_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  description TEXT,
  report_type TEXT NOT NULL DEFAULT 'custom',  -- custom, pipeline, performance, leads, revenue, activity
  config JSONB NOT NULL DEFAULT '{}',
  -- config example: { metrics: ["count"], dimensions: ["status"], filters: { source: "facebook" }, chart_type: "bar" }
  schedule JSONB,
  -- schedule example: { frequency: "daily", time: "08:00", recipients: ["email@test.com"], active: true }
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_reports_tenant_id ON saved_reports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_saved_reports_type ON saved_reports(report_type);
CREATE INDEX IF NOT EXISTS idx_saved_reports_created_by ON saved_reports(created_by);

ALTER TABLE saved_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON saved_reports FOR ALL
  USING (tenant_id = current_tenant_id());

CREATE TRIGGER trg_set_tenant_id
  BEFORE INSERT ON saved_reports
  FOR EACH ROW EXECUTE FUNCTION set_tenant_id_on_insert();


-- ═══ 2. Report Snapshots ═══
CREATE TABLE IF NOT EXISTS report_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  report_id UUID NOT NULL REFERENCES saved_reports(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}',
  row_count INTEGER NOT NULL DEFAULT 0,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_snapshots_tenant_id ON report_snapshots(tenant_id);
CREATE INDEX IF NOT EXISTS idx_report_snapshots_report_id ON report_snapshots(report_id);
CREATE INDEX IF NOT EXISTS idx_report_snapshots_generated_at ON report_snapshots(generated_at);

ALTER TABLE report_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON report_snapshots FOR ALL
  USING (tenant_id = current_tenant_id());

CREATE TRIGGER trg_set_tenant_id
  BEFORE INSERT ON report_snapshots
  FOR EACH ROW EXECUTE FUNCTION set_tenant_id_on_insert();
