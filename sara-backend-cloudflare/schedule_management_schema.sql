-- Horarios regulares (ya existe)
-- availability_schedules

-- GUARDIAS (turnos especiales, fines de semana, etc)
CREATE TABLE IF NOT EXISTS duty_shifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES team_members(id),
  user_type VARCHAR(50) NOT NULL,
  shift_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- EXCEPCIONES (vacaciones, días libres, ausencias)
CREATE TABLE IF NOT EXISTS schedule_exceptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES team_members(id),
  exception_type VARCHAR(50) NOT NULL, -- 'vacation', 'sick_leave', 'day_off', 'holiday'
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_duty_shifts_user ON duty_shifts(user_id, shift_date);
CREATE INDEX idx_schedule_exceptions_user ON schedule_exceptions(user_id, start_date, end_date);

-- Vista combinada de disponibilidad
CREATE OR REPLACE VIEW team_availability_view AS
SELECT 
  tm.id as user_id,
  tm.name,
  tm.role,
  tm.phone,
  tm.email,
  avs.day_of_week,
  avs.start_time,
  avs.end_time,
  NULL as shift_date,
  'regular' as schedule_type
FROM team_members tm
JOIN availability_schedules avs ON tm.id = avs.user_id
WHERE tm.active = true

UNION ALL

SELECT 
  tm.id as user_id,
  tm.name,
  tm.role,
  tm.phone,
  tm.email,
  NULL as day_of_week,
  ds.start_time,
  ds.end_time,
  ds.shift_date,
  'duty_shift' as schedule_type
FROM team_members tm
JOIN duty_shifts ds ON tm.id = ds.user_id
WHERE tm.active = true AND ds.is_active = true;
