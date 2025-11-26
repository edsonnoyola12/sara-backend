-- PROPIEDADES (inventario real)
CREATE TABLE IF NOT EXISTS properties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  development VARCHAR(100) NOT NULL, -- Los Encinos, Villas Santa Rita, Terrenos
  model VARCHAR(100), -- Ciprés, Roble, Nogal, etc
  bedrooms INTEGER,
  bathrooms DECIMAL(3,1),
  size_m2 DECIMAL(10,2),
  price DECIMAL(15,2),
  status VARCHAR(50) DEFAULT 'available', -- available, reserved, sold
  description TEXT,
  amenities JSONB,
  images JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- DISPONIBILIDAD DE VENDEDORES (horarios de trabajo)
CREATE TABLE IF NOT EXISTS salesperson_availability (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  salesperson_id UUID REFERENCES team_members(id),
  day_of_week INTEGER, -- 0=domingo, 1=lunes, etc
  start_time TIME,
  end_time TIME,
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- CITAS AGENDADAS
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID REFERENCES leads(id),
  salesperson_id UUID REFERENCES team_members(id),
  property_id UUID REFERENCES properties(id),
  scheduled_date DATE NOT NULL,
  scheduled_time TIME NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  status VARCHAR(50) DEFAULT 'scheduled', -- scheduled, completed, cancelled, no_show
  calendar_event_id VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_properties_development ON properties(development);
CREATE INDEX idx_properties_status ON properties(status);
CREATE INDEX idx_salesperson_availability ON salesperson_availability(salesperson_id, day_of_week);
CREATE INDEX idx_appointments_salesperson ON appointments(salesperson_id, scheduled_date);
CREATE INDEX idx_appointments_lead ON appointments(lead_id);

-- Datos de ejemplo - PROPIEDADES REALES
INSERT INTO properties (name, development, model, bedrooms, bathrooms, size_m2, price, status, description) VALUES
-- Los Encinos (Premium)
('Casa Ciprés 1', 'Los Encinos', 'Ciprés', 3, 2.5, 180, 3200000, 'available', 'Casa de lujo con acabados premium'),
('Casa Ciprés 2', 'Los Encinos', 'Ciprés', 3, 2.5, 180, 3200000, 'available', 'Casa de lujo con acabados premium'),
('Casa Roble 1', 'Los Encinos', 'Roble', 4, 3, 220, 4100000, 'available', 'Residencia espaciosa con jardín'),
('Casa Nogal 1', 'Los Encinos', 'Nogal', 4, 3.5, 250, 4800000, 'reserved', 'Casa con estudio y amplias áreas'),

-- Villas Santa Rita (Familiar)
('Casa Fresno 1', 'Villas Santa Rita', 'Fresno', 2, 2, 120, 1800000, 'available', 'Casa ideal para parejas'),
('Casa Fresno 2', 'Villas Santa Rita', 'Fresno', 2, 2, 120, 1800000, 'available', 'Casa ideal para parejas'),
('Casa Sauce 1', 'Villas Santa Rita', 'Sauce', 3, 2.5, 150, 2300000, 'available', 'Casa familiar con patio'),
('Casa Olmo 1', 'Villas Santa Rita', 'Olmo', 3, 2.5, 170, 2700000, 'available', 'Casa con jardín amplio'),

-- Terrenos
('Terreno 200m²', 'Terrenos Centro', NULL, NULL, NULL, 200, 800000, 'available', 'Terreno urbano céntrico'),
('Terreno 300m²', 'Terrenos Centro', NULL, NULL, NULL, 300, 1100000, 'available', 'Terreno amplio céntrico'),
('Terreno 500m²', 'Terrenos Centro', NULL, NULL, NULL, 500, 1600000, 'available', 'Terreno premium céntrico');

-- Horarios de vendedores (ejemplo)
-- Ana García trabaja Lunes a Viernes 9am-6pm
INSERT INTO salesperson_availability (salesperson_id, day_of_week, start_time, end_time) 
SELECT id, generate_series(1,5), '09:00'::TIME, '18:00'::TIME 
FROM team_members WHERE name = 'Ana García' LIMIT 1;

-- Carlos Rodríguez trabaja Lunes a Sábado 10am-7pm
INSERT INTO salesperson_availability (salesperson_id, day_of_week, start_time, end_time) 
SELECT id, generate_series(1,6), '10:00'::TIME, '19:00'::TIME 
FROM team_members WHERE name = 'Carlos Rodríguez' LIMIT 1;
