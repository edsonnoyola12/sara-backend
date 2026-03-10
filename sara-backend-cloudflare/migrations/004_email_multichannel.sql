-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 004: Email Templates, Communications Log, Multi-channel
-- Phase 4: Email via Resend, SMS fallback via Twilio, unified timeline
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ 1. Email Templates ═══
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  variables JSONB DEFAULT '[]',    -- expected variables: ["name", "date", "property"]
  category TEXT NOT NULL DEFAULT 'general',  -- general, welcome, appointment, follow_up, mortgage, marketing, newsletter
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_email_templates_tenant_id ON email_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_templates_category ON email_templates(category);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON email_templates FOR ALL
  USING (tenant_id = current_tenant_id());

CREATE TRIGGER trg_set_tenant_id
  BEFORE INSERT ON email_templates
  FOR EACH ROW EXECUTE FUNCTION set_tenant_id_on_insert();


-- ═══ 2. Communications Log ═══
CREATE TABLE IF NOT EXISTS communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  lead_id UUID REFERENCES leads(id),
  team_member_id UUID REFERENCES team_members(id),
  channel TEXT NOT NULL,          -- whatsapp, email, sms, call, retell
  direction TEXT NOT NULL,        -- inbound, outbound
  content TEXT,
  subject TEXT,                   -- for emails
  status TEXT NOT NULL DEFAULT 'sent',  -- pending, sent, delivered, read, failed, bounced
  error_message TEXT,
  external_id TEXT,               -- wamid, email id, sms sid, call id
  template_id UUID REFERENCES email_templates(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_communications_tenant_id ON communications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_communications_lead_id ON communications(lead_id);
CREATE INDEX IF NOT EXISTS idx_communications_channel ON communications(channel);
CREATE INDEX IF NOT EXISTS idx_communications_created_at ON communications(created_at);
CREATE INDEX IF NOT EXISTS idx_communications_tenant_lead ON communications(tenant_id, lead_id);

ALTER TABLE communications ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON communications FOR ALL
  USING (tenant_id = current_tenant_id());

CREATE TRIGGER trg_set_tenant_id
  BEFORE INSERT ON communications
  FOR EACH ROW EXECUTE FUNCTION set_tenant_id_on_insert();


-- ═══ 3. Add email and preferred_channel to leads ═══
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'email') THEN
    ALTER TABLE leads ADD COLUMN email TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'preferred_channel') THEN
    ALTER TABLE leads ADD COLUMN preferred_channel TEXT NOT NULL DEFAULT 'whatsapp';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email) WHERE email IS NOT NULL;


-- ═══ 4. Seed default email templates for Santa Rita ═══
INSERT INTO email_templates (tenant_id, slug, name, subject, html_body, variables, category) VALUES

('00000000-0000-0000-0000-000000000001', 'bienvenida', 'Bienvenida',
  'Bienvenido a Grupo Santa Rita, {{name}}',
  '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px"><h1 style="color:#2d5a27">Bienvenido, {{name}}</h1><p>Gracias por tu interes en nuestros desarrollos inmobiliarios.</p><p>Un asesor se pondra en contacto contigo pronto para ayudarte a encontrar tu hogar ideal.</p><p style="margin-top:30px;color:#666">Grupo Santa Rita<br>Tu hogar en Zacatecas</p></div>',
  '["name"]', 'welcome'),

('00000000-0000-0000-0000-000000000001', 'confirmacion_cita', 'Confirmacion de Cita',
  'Tu cita ha sido confirmada - {{date}} a las {{time}}',
  '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px"><h1 style="color:#2d5a27">Cita Confirmada</h1><p>Hola {{name}},</p><p>Tu cita ha sido confirmada para el <strong>{{date}}</strong> a las <strong>{{time}}</strong> en <strong>{{property}}</strong>.</p><p>Direccion: {{address}}</p><p style="margin-top:20px">Te esperamos!</p><p style="color:#666">Grupo Santa Rita</p></div>',
  '["name","date","time","property","address"]', 'appointment'),

('00000000-0000-0000-0000-000000000001', 'recordatorio_cita', 'Recordatorio de Cita',
  'Recordatorio: Tu cita es manana {{date}}',
  '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px"><h1 style="color:#2d5a27">Recordatorio de Cita</h1><p>Hola {{name}},</p><p>Te recordamos que tienes una cita manana <strong>{{date}}</strong> a las <strong>{{time}}</strong>.</p><p>Desarrollo: <strong>{{property}}</strong></p><p style="color:#666">Grupo Santa Rita</p></div>',
  '["name","date","time","property"]', 'appointment'),

('00000000-0000-0000-0000-000000000001', 'followup', 'Seguimiento',
  '{{name}}, seguimos a tu disposicion',
  '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px"><h1 style="color:#2d5a27">Seguimiento</h1><p>Hola {{name}},</p><p>Queríamos saber si tienes alguna pregunta sobre nuestros desarrollos o si te gustaria agendar una visita.</p><p>Estamos para ayudarte.</p><p style="color:#666">Grupo Santa Rita</p></div>',
  '["name"]', 'follow_up'),

('00000000-0000-0000-0000-000000000001', 'update_hipoteca', 'Actualizacion de Credito',
  'Actualizacion sobre tu credito hipotecario',
  '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px"><h1 style="color:#2d5a27">Actualizacion de Credito</h1><p>Hola {{name}},</p><p>{{message}}</p><p>Si tienes dudas, no dudes en contactarnos.</p><p style="color:#666">Grupo Santa Rita</p></div>',
  '["name","message"]', 'mortgage'),

('00000000-0000-0000-0000-000000000001', 'nuevas_propiedades', 'Nuevas Propiedades',
  'Nuevas opciones disponibles para ti, {{name}}',
  '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px"><h1 style="color:#2d5a27">Nuevas Propiedades</h1><p>Hola {{name}},</p><p>Tenemos nuevas opciones que podrian interesarte:</p>{{properties_html}}<p style="margin-top:20px">Agenda una visita para conocerlas.</p><p style="color:#666">Grupo Santa Rita</p></div>',
  '["name","properties_html"]', 'marketing'),

('00000000-0000-0000-0000-000000000001', 'newsletter', 'Newsletter Mensual',
  'Novedades de Grupo Santa Rita - {{month}}',
  '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px"><h1 style="color:#2d5a27">Newsletter {{month}}</h1><p>Hola {{name}},</p>{{content}}<p style="margin-top:30px;color:#666">Grupo Santa Rita<br>Tu hogar en Zacatecas</p></div>',
  '["name","month","content"]', 'newsletter')

ON CONFLICT (tenant_id, slug) DO NOTHING;
