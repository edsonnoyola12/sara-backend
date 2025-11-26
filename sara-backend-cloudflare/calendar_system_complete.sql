-- Horarios de trabajo (vendedores y asesores)
CREATE TABLE IF NOT EXISTS availability_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES team_members(id),
  user_type VARCHAR(50) NOT NULL, -- 'salesperson' o 'mortgage_advisor'
  day_of_week INTEGER NOT NULL, -- 0=domingo, 1=lunes, etc
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  slot_duration_minutes INTEGER DEFAULT 60,
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Citas (actualizada)
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID REFERENCES leads(id),
  assigned_to_id UUID REFERENCES team_members(id), -- vendedor o asesor
  assigned_to_type VARCHAR(50) NOT NULL, -- 'salesperson' o 'mortgage_advisor'
  property_id UUID REFERENCES properties(id),
  scheduled_date DATE NOT NULL,
  scheduled_time TIME NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  status VARCHAR(50) DEFAULT 'scheduled',
  appointment_type VARCHAR(50), -- 'property_viewing', 'mortgage_consultation'
  google_calendar_event_id VARCHAR(255),
  google_calendar_event_url TEXT,
  cancellation_reason TEXT,
  cancelled_by VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_availability_user ON availability_schedules(user_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_appointments_assigned ON appointments(assigned_to_id, scheduled_date, scheduled_time);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);

-- Datos de ejemplo - Horarios de Ana García (vendedor)
-- Lunes a Viernes 9am-6pm
DO $$
DECLARE
  ana_id UUID;
BEGIN
  SELECT id INTO ana_id FROM team_members WHERE name = 'Ana García' LIMIT 1;
  
  IF ana_id IS NOT NULL THEN
    -- Lunes a Viernes
    FOR day IN 1..5 LOOP
      INSERT INTO availability_schedules (user_id, user_type, day_of_week, start_time, end_time)
      VALUES (ana_id, 'salesperson', day, '09:00', '18:00')
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
END $$;

-- Horarios de Carlos Rodríguez (vendedor)
-- Lunes a Sábado 10am-7pm
DO $$
DECLARE
  carlos_id UUID;
BEGIN
  SELECT id INTO carlos_id FROM team_members WHERE name = 'Carlos Rodríguez' LIMIT 1;
  
  IF carlos_id IS NOT NULL THEN
    -- Lunes a Sábado
    FOR day IN 1..6 LOOP
      INSERT INTO availability_schedules (user_id, user_type, day_of_week, start_time, end_time)
      VALUES (carlos_id, 'salesperson', day, '10:00', '19:00')
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
END $$;
