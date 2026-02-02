-- =====================================================
-- ACTUALIZACIÓN DE PRECIOS - VIGENTE AL 28 FEB 2026
-- =====================================================

-- =====================================================
-- LOS ENCINOS
-- =====================================================
UPDATE properties SET
  price = 2888864,
  price_equipped = 3004115,
  land_size = 102,
  area_m2 = 166.80,
  floors = 2,
  bedrooms = 3,
  has_vestidor = true
WHERE name = 'Encino Blanco' AND development = 'Los Encinos';

UPDATE properties SET
  price = 3424391,
  price_equipped = 3551830,
  land_size = 119,
  area_m2 = 203.30,
  floors = 2,
  bedrooms = 3,
  has_vestidor = true
WHERE name = 'Encino Verde' AND development = 'Los Encinos';

UPDATE properties SET
  price = 3655444,
  price_equipped = 3795090,
  land_size = 204,
  area_m2 = 146.50,
  floors = 1,
  bedrooms = 3,
  has_vestidor = true
WHERE name = 'Encino Dorado' AND development = 'Los Encinos';

UPDATE properties SET
  price = 3124738,
  price_equipped = 3252013,
  land_size = 102,
  area_m2 = 182.40,
  floors = 3,
  bedrooms = 3,
  has_vestidor = true,
  has_terrace = true
WHERE name = 'Roble Descendente' AND development = 'Los Encinos';

UPDATE properties SET
  price = 3434524,
  price_equipped = 3569318,
  land_size = 119,
  area_m2 = 210.80,
  floors = 3,
  bedrooms = 3,
  has_vestidor = true,
  has_terrace = true
WHERE name = 'Maple Ascendente' AND development = 'Los Encinos';

-- También actualizar "Ascendente" y "Descendente" si existen como nombres alternativos
UPDATE properties SET
  price = 3434524,
  price_equipped = 3569318
WHERE name = 'Ascendente' AND development = 'Los Encinos';

UPDATE properties SET
  price = 3124738,
  price_equipped = 3252013
WHERE name = 'Descendente' AND development = 'Los Encinos';

-- =====================================================
-- MONTE VERDE
-- =====================================================
UPDATE properties SET
  price = 1522542,
  price_equipped = 1596743,
  land_size = 102,
  area_m2 = 60.90,
  floors = 1,
  bedrooms = 2
WHERE name = 'Acacia' AND development = 'Monte Verde';

UPDATE properties SET
  price = 2508834,
  price_equipped = 2609344,
  land_size = 153,
  area_m2 = 104.80,
  floors = 1,
  bedrooms = 3
WHERE name = 'Fresno' AND development = 'Monte Verde';

UPDATE properties SET
  price = 2712583,
  price_equipped = 2838098,
  land_size = 153,
  area_m2 = 115.60,
  floors = 1,
  bedrooms = 3,
  has_vestidor = true
WHERE name = 'Fresno 2' AND development = 'Monte Verde';

UPDATE properties SET
  price = 1925840,
  price_equipped = 2008660,
  land_size = 102,
  area_m2 = 88.86,
  floors = 2,
  bedrooms = 2
WHERE name = 'Eucalipto' AND development = 'Monte Verde';

UPDATE properties SET
  price = 2085052,
  price_equipped = 2176843,
  land_size = 102,
  area_m2 = 109.41,
  floors = 2,
  bedrooms = 3
WHERE name = 'Olivo' AND development = 'Monte Verde';

-- =====================================================
-- ANDES
-- =====================================================
UPDATE properties SET
  price = 1522542,
  price_equipped = 1596743,
  land_size = 102,
  area_m2 = 59.50,
  floors = 1,
  bedrooms = 2
WHERE name = 'Laurel' AND development = 'Andes';

UPDATE properties SET
  price = 1987204,
  price_equipped = 2085326,
  land_size = 102,
  area_m2 = 89.20,
  floors = 2,
  bedrooms = 2
WHERE name = 'Dalia' AND development = 'Andes';

UPDATE properties SET
  price = 2151059,
  price_equipped = 2258019,
  land_size = 102,
  area_m2 = 110.10,
  floors = 2,
  bedrooms = 3
WHERE name = 'Gardenia' AND development = 'Andes';

UPDATE properties SET
  price = 2712583,
  price_equipped = 2838098,
  land_size = 153,
  area_m2 = 115.00,
  floors = 1,
  bedrooms = 3,
  has_vestidor = true
WHERE name = 'Lavanda' AND development = 'Andes';

-- =====================================================
-- DISTRITO FALCO
-- =====================================================
UPDATE properties SET
  price = 4841479,
  price_equipped = 5061359,
  land_size = 160,
  area_m2 = 224.05,
  floors = 2,
  bedrooms = 3,
  has_vestidor = true,
  has_garden = true,
  has_terrace = true
WHERE name = 'Chipre' AND development = 'Distrito Falco';

UPDATE properties SET
  price = 5136240,
  price_equipped = 5375561,
  land_size = 240,
  area_m2 = 166.37,
  floors = 1,
  bedrooms = 3,
  has_vestidor = true,
  has_garden = true
WHERE name = 'Calandria' AND development = 'Distrito Falco';

UPDATE properties SET
  price = 4965721,
  price_equipped = 5159105,
  land_size = 160,
  area_m2 = 220.39,
  floors = 2,
  bedrooms = 3,
  has_vestidor = true,
  has_garden = true,
  has_terrace = true,
  description = '2 plantas descendente, 3 rec, estudio-sala TV, vestidores, patio-jardín, terrazas'
WHERE name = 'Mirlo' AND development = 'Distrito Falco';

UPDATE properties SET
  price = 4605902,
  price_equipped = 4793628,
  land_size = 160,
  area_m2 = 209.73,
  floors = 2,
  bedrooms = 3,
  has_vestidor = true,
  has_garden = true,
  has_terrace = true,
  description = '2 plantas ascendente, 3 rec, estudio-sala TV, vestidor, patio-jardín, terrazas'
WHERE name = 'Colibrí' AND development = 'Distrito Falco';

UPDATE properties SET
  price = 3908101,
  price_equipped = 4100586,
  land_size = 160,
  area_m2 = 165.11,
  floors = 2,
  bedrooms = 3,
  has_vestidor = true,
  has_garden = true,
  has_terrace = true,
  description = '2 plantas ascendente, 3 rec, estudio-sala TV, vestidor, patio-jardín, terrazas'
WHERE name = 'Colibrí Light' AND development = 'Distrito Falco';

UPDATE properties SET
  price = 3834190,
  price_equipped = 4036741,
  land_size = 160,
  area_m2 = 165.20,
  floors = 2,
  bedrooms = 3,
  has_vestidor = true,
  has_garden = true,
  has_terrace = true
WHERE name = 'Chipre Light' AND development = 'Distrito Falco';

UPDATE properties SET
  price = 3526827,
  price_equipped = 3705354,
  land_size = 169.50,
  area_m2 = 139.20,
  floors = 2,
  bedrooms = 2,
  has_vestidor = true,
  has_terrace = true
WHERE name = 'Proyecto Especial' AND development = 'Distrito Falco';

-- =====================================================
-- MIRAVALLE
-- =====================================================
UPDATE properties SET
  price = 3396518,
  price_equipped = 3514470,
  land_size = 102,
  area_m2 = 210.94,
  floors = 3,
  bedrooms = 3,
  has_vestidor = true,
  has_roof_garden = true,
  description = '3 plantas, sala doble altura, roof garden-terraza, cochera 2 autos techada'
WHERE name = 'Vizcaya' AND development = 'Miravalle';

-- Actualizar también si se llama "Vizcaya 6M"
UPDATE properties SET
  price = 3396518,
  price_equipped = 3514470,
  land_size = 102,
  area_m2 = 210.94,
  floors = 3,
  bedrooms = 3,
  has_vestidor = true,
  has_roof_garden = true
WHERE name = 'Vizcaya 6M' AND development = 'Miravalle';

UPDATE properties SET
  price = 3988852,
  price_equipped = 4106805,
  land_size = 119,
  area_m2 = 242.90,
  floors = 3,
  bedrooms = 3,
  has_vestidor = true,
  has_roof_garden = true,
  description = '3 plantas, sala doble altura, roof garden-terraza, cochera 2 autos techada'
WHERE name = 'Bilbao 7M' AND development = 'Miravalle';

-- También "Bilbao"
UPDATE properties SET
  price = 3988852,
  price_equipped = 4106805
WHERE name = 'Bilbao' AND development = 'Miravalle';

UPDATE properties SET
  price = 3621949,
  price_equipped = 3756099,
  land_size = 120,
  area_m2 = 200.20,
  floors = 3,
  bedrooms = 3
WHERE name = 'Casa Habitación 6m' AND development = 'Miravalle';

UPDATE properties SET
  price = 4208613,
  price_equipped = 4350543,
  land_size = 140,
  area_m2 = 232.50,
  floors = 3,
  bedrooms = 3
WHERE name = 'Casa Habitación 7m' AND development = 'Miravalle';

UPDATE properties SET
  price = 2935033,
  price_equipped = 3046964,
  land_size = 120,
  area_m2 = 132.80,
  floors = 2,
  bedrooms = 2
WHERE name = 'Departamento 6m' AND development = 'Miravalle';

UPDATE properties SET
  price = 3424995,
  price_equipped = 3543667,
  land_size = 140,
  area_m2 = 152.60,
  floors = 2,
  bedrooms = 2
WHERE name = 'Departamento 7m' AND development = 'Miravalle';

-- =====================================================
-- TERRENOS - Precios por m² (usando lote mínimo 102m²)
-- =====================================================
-- Villa Campelo: Zona 4 = $8,500/m² × 102m² = $867,000 (precio base más accesible)
UPDATE properties SET
  price = 867000,
  price_equipped = NULL,
  land_size = 102,
  description = 'Terrenos desde 102m². Precio por m²: Zona 1 $9,500, Zona 2 $9,100, Zona 3 $8,800, Zona 4 $8,500. Descuentos: 10% contado, 7% a 3 meses, 5% a 6 MSI. Financiamiento hasta 13 meses.'
WHERE name = 'Terreno Villa Campelo' AND development = 'Villa Campelo';

-- Villa Galiano: $6,400/m² × 102m² = $652,800
UPDATE properties SET
  price = 652800,
  price_equipped = NULL,
  land_size = 102,
  description = 'Terrenos desde 102m². Precio: $6,400/m² contado, $6,700/m² financiamiento 13 meses. Enganche 30%. Ubicación: Av. La Cañada Real, Fracc. El Nogal, Guadalupe.'
WHERE name = 'Terreno Villa Galiano' AND development = 'Villa Galiano';

-- =====================================================
-- NUEVO DESARROLLO: PASEO COLORINES
-- =====================================================
INSERT INTO properties (
  name, development, category, neighborhood, city,
  price, price_equipped, land_size, area_m2, floors, bedrooms, bathrooms,
  has_vestidor, has_terrace, has_garden,
  description, sales_phrase, ideal_client
) VALUES
(
  'Prototipo 6M',
  'Paseo Colorines',
  'Casa',
  'Colinas del Padre',
  'Zacatecas',
  3000504,
  NULL,
  102,
  168.90,
  2,
  3,
  2.5,
  true,
  true,
  false,
  '2 plantas, 3 recámaras, sala-comedor, cocina, 2 baños y medio, área de lavado, patio, vestidor, terraza, cochera 2 autos. Incluye canceles de baño.',
  'Nuevo desarrollo en Colinas del Padre con excelente ubicación',
  'Familias jóvenes que buscan casa nueva en zona consolidada'
),
(
  'Prototipo 7M',
  'Paseo Colorines',
  'Casa',
  'Colinas del Padre',
  'Zacatecas',
  3562634,
  NULL,
  119,
  206.40,
  2,
  3,
  2.5,
  true,
  false,
  false,
  '2 plantas, 3 recámaras, sala-comedor, cocina, 2 baños y medio, área de lavado, patio, vestidor, estudio-sala TV, cochera 2 autos. Incluye canceles de baño.',
  'Modelo amplio con estudio adicional',
  'Familias que necesitan espacio extra para home office'
);

-- =====================================================
-- ALPES (si existe, actualizar con precio de Dalia Alpes del PDF)
-- =====================================================
UPDATE properties SET
  price = 1987193,
  price_equipped = 2074938
WHERE name = 'Dalia Alpes' AND development = 'Alpes';

-- Verificar conteo final
SELECT development, COUNT(*) as modelos, MIN(price) as precio_min, MAX(price) as precio_max
FROM properties
GROUP BY development
ORDER BY development;
