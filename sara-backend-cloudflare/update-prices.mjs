import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://bpxnknoldqyjacvlxqzl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJweG5rbm9sZHF5amFjdmx4cXpsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0OTUwMDMwNywiZXhwIjoyMDY1MDc2MzA3fQ.3SBwHmUj1FeYjLDsfTkRBMl_0h9pVpOcbmQyrPN-stk'
);

const updates = [
  // LOS ENCINOS
  { name: 'Encino Blanco', development: 'Los Encinos', price: 2888864, price_equipped: 3004115, land_size: 102, area_m2: 166.80, floors: 1, bedrooms: 3, has_vestidor: true },
  { name: 'Encino Verde', development: 'Los Encinos', price: 3424391, price_equipped: 3551830, land_size: 119, area_m2: 203.30, floors: 2, bedrooms: 3, has_vestidor: true },
  { name: 'Encino Dorado', development: 'Los Encinos', price: 3655444, price_equipped: 3795090, land_size: 204, area_m2: 146.50, floors: 1, bedrooms: 3, has_vestidor: true },
  { name: 'Roble Descendente', development: 'Los Encinos', price: 3124738, price_equipped: 3252013, land_size: 102, area_m2: 182.40, floors: 3, bedrooms: 3, has_vestidor: true, has_terrace: true },
  { name: 'Maple Ascendente', development: 'Los Encinos', price: 3434524, price_equipped: 3569318, land_size: 119, area_m2: 210.80, floors: 3, bedrooms: 3, has_vestidor: true, has_terrace: true },
  { name: 'Ascendente', development: 'Los Encinos', price: 3434524, price_equipped: 3569318 },
  { name: 'Descendente', development: 'Los Encinos', price: 3124738, price_equipped: 3252013 },

  // MONTE VERDE
  { name: 'Acacia', development: 'Monte Verde', price: 1522542, price_equipped: 1596743, land_size: 102, area_m2: 60.90, floors: 1, bedrooms: 2 },
  { name: 'Fresno', development: 'Monte Verde', price: 2508834, price_equipped: 2609344, land_size: 153, area_m2: 104.80, floors: 1, bedrooms: 3 },
  { name: 'Fresno 2', development: 'Monte Verde', price: 2712583, price_equipped: 2838098, land_size: 153, area_m2: 115.60, floors: 1, bedrooms: 3, has_vestidor: true },
  { name: 'Eucalipto', development: 'Monte Verde', price: 1925840, price_equipped: 2008660, land_size: 102, area_m2: 88.86, floors: 2, bedrooms: 2 },
  { name: 'Olivo', development: 'Monte Verde', price: 2085052, price_equipped: 2176843, land_size: 102, area_m2: 109.41, floors: 2, bedrooms: 3 },

  // ANDES
  { name: 'Laurel', development: 'Andes', price: 1522542, price_equipped: 1596743, land_size: 102, area_m2: 59.50, floors: 1, bedrooms: 2 },
  { name: 'Dalia', development: 'Andes', price: 1987204, price_equipped: 2085326, land_size: 102, area_m2: 89.20, floors: 2, bedrooms: 2 },
  { name: 'Gardenia', development: 'Andes', price: 2151059, price_equipped: 2258019, land_size: 102, area_m2: 110.10, floors: 2, bedrooms: 3 },
  { name: 'Lavanda', development: 'Andes', price: 2712583, price_equipped: 2838098, land_size: 153, area_m2: 115.00, floors: 1, bedrooms: 3, has_vestidor: true },

  // DISTRITO FALCO
  { name: 'Chipre', development: 'Distrito Falco', price: 4841479, price_equipped: 5061359, land_size: 160, area_m2: 224.05, floors: 2, bedrooms: 3, has_vestidor: true, has_garden: true, has_terrace: true },
  { name: 'Calandria', development: 'Distrito Falco', price: 5136240, price_equipped: 5375561, land_size: 240, area_m2: 166.37, floors: 1, bedrooms: 3, has_vestidor: true, has_garden: true },
  { name: 'Mirlo', development: 'Distrito Falco', price: 4965721, price_equipped: 5159105, land_size: 160, area_m2: 220.39, floors: 2, bedrooms: 3, has_vestidor: true, has_garden: true, has_terrace: true },
  { name: 'Colibrí', development: 'Distrito Falco', price: 4605902, price_equipped: 4793628, land_size: 160, area_m2: 209.73, floors: 2, bedrooms: 3, has_vestidor: true, has_garden: true, has_terrace: true },
  { name: 'Colibrí Light', development: 'Distrito Falco', price: 3908101, price_equipped: 4100586, land_size: 160, area_m2: 165.11, floors: 2, bedrooms: 3, has_vestidor: true, has_garden: true, has_terrace: true },
  { name: 'Chipre Light', development: 'Distrito Falco', price: 3834190, price_equipped: 4036741, land_size: 160, area_m2: 165.20, floors: 2, bedrooms: 3, has_vestidor: true, has_garden: true, has_terrace: true },
  { name: 'Proyecto Especial', development: 'Distrito Falco', price: 3526827, price_equipped: 3705354, land_size: 169.50, area_m2: 139.20, floors: 2, bedrooms: 2, has_vestidor: true, has_terrace: true },

  // MIRAVALLE
  { name: 'Vizcaya', development: 'Miravalle', price: 3396518, price_equipped: 3514470, land_size: 102, area_m2: 210.94, floors: 3, bedrooms: 3, has_vestidor: true, has_roof_garden: true },
  { name: 'Vizcaya 6M', development: 'Miravalle', price: 3396518, price_equipped: 3514470, land_size: 102, area_m2: 210.94, floors: 3, bedrooms: 3, has_vestidor: true, has_roof_garden: true },
  { name: 'Bilbao 7M', development: 'Miravalle', price: 3988852, price_equipped: 4106805, land_size: 119, area_m2: 242.90, floors: 3, bedrooms: 3, has_vestidor: true, has_roof_garden: true },
  { name: 'Bilbao', development: 'Miravalle', price: 3988852, price_equipped: 4106805 },
  { name: 'Casa Habitación 6m', development: 'Miravalle', price: 3621949, price_equipped: 3756099, land_size: 120, area_m2: 200.20, floors: 3, bedrooms: 3 },
  { name: 'Casa Habitación 7m', development: 'Miravalle', price: 4208613, price_equipped: 4350543, land_size: 140, area_m2: 232.50, floors: 3, bedrooms: 3 },
  { name: 'Departamento 6m', development: 'Miravalle', price: 2935033, price_equipped: 3046964, land_size: 120, area_m2: 132.80, floors: 2, bedrooms: 2 },
  { name: 'Departamento 7m', development: 'Miravalle', price: 3424995, price_equipped: 3543667, land_size: 140, area_m2: 152.60, floors: 2, bedrooms: 2 },

  // TERRENOS
  { name: 'Terreno Villa Campelo', development: 'Villa Campelo', price: 867000, price_equipped: null, land_size: 102, description: 'Terrenos desde 102m². Precio por m²: Zona 1 $9,500, Zona 2 $9,100, Zona 3 $8,800, Zona 4 $8,500. Descuentos: 10% contado, 7% a 3 meses, 5% a 6 MSI.' },
  { name: 'Terreno Villa Galiano', development: 'Villa Galiano', price: 652800, price_equipped: null, land_size: 102, description: 'Terrenos desde 102m². Precio: $6,400/m² contado, $6,700/m² financiamiento 13 meses. Enganche 30%.' },

  // ALPES
  { name: 'Dalia Alpes', development: 'Alpes', price: 1987193, price_equipped: 2074938 },
];

// Nuevos desarrollos a insertar
const newProperties = [
  {
    name: 'Prototipo 6M',
    development: 'Paseo Colorines',
    category: 'Casa',
    neighborhood: 'Colinas del Padre',
    city: 'Zacatecas',
    price: 3000504,
    price_equipped: null,
    land_size: 102,
    area_m2: 168.90,
    floors: 2,
    bedrooms: 3,
    bathrooms: 2.5,
    has_vestidor: true,
    has_terrace: true,
    has_garden: false,
    description: '2 plantas, 3 recámaras, sala-comedor, cocina, 2 baños y medio, área de lavado, patio, vestidor, terraza, cochera 2 autos. Incluye canceles de baño.',
    sales_phrase: 'Nuevo desarrollo en Colinas del Padre',
    ideal_client: 'Familias jóvenes'
  },
  {
    name: 'Prototipo 7M',
    development: 'Paseo Colorines',
    category: 'Casa',
    neighborhood: 'Colinas del Padre',
    city: 'Zacatecas',
    price: 3562634,
    price_equipped: null,
    land_size: 119,
    area_m2: 206.40,
    floors: 2,
    bedrooms: 3,
    bathrooms: 2.5,
    has_vestidor: true,
    has_terrace: false,
    has_garden: false,
    has_study: true,
    description: '2 plantas, 3 recámaras, sala-comedor, cocina, 2 baños y medio, área de lavado, patio, vestidor, estudio-sala TV, cochera 2 autos. Incluye canceles de baño.',
    sales_phrase: 'Modelo amplio con estudio',
    ideal_client: 'Familias que necesitan home office'
  }
];

async function updatePrices() {
  console.log('🚀 Iniciando actualización de precios...\n');

  let updated = 0;
  let errors = 0;

  for (const prop of updates) {
    const { name, development, ...data } = prop;

    const { error } = await supabase
      .from('properties')
      .update(data)
      .eq('name', name)
      .eq('development', development);

    if (error) {
      console.log(`❌ Error actualizando ${name} (${development}):`, error.message);
      errors++;
    } else {
      console.log(`✅ ${name} (${development}) - $${data.price?.toLocaleString()} / Equipada: $${data.price_equipped?.toLocaleString() || 'N/A'}`);
      updated++;
    }
  }

  console.log(`\n📊 Actualizaciones: ${updated} exitosas, ${errors} errores`);

  // Insertar nuevos desarrollos
  console.log('\n🏗️ Agregando Paseo Colorines...\n');

  for (const prop of newProperties) {
    // Verificar si ya existe
    const { data: existing } = await supabase
      .from('properties')
      .select('id')
      .eq('name', prop.name)
      .eq('development', prop.development)
      .single();

    if (existing) {
      console.log(`⏭️ ${prop.name} ya existe, actualizando...`);
      const { error } = await supabase
        .from('properties')
        .update(prop)
        .eq('name', prop.name)
        .eq('development', prop.development);

      if (error) {
        console.log(`❌ Error:`, error.message);
      } else {
        console.log(`✅ Actualizado ${prop.name}`);
      }
    } else {
      const { error } = await supabase
        .from('properties')
        .insert(prop);

      if (error) {
        console.log(`❌ Error insertando ${prop.name}:`, error.message);
      } else {
        console.log(`✅ Insertado ${prop.name} - $${prop.price.toLocaleString()}`);
      }
    }
  }

  // Verificar resultado final
  console.log('\n📋 Resumen por desarrollo:\n');

  const { data: summary } = await supabase
    .from('properties')
    .select('development, price, price_equipped');

  const byDev = {};
  for (const p of summary || []) {
    if (!byDev[p.development]) {
      byDev[p.development] = { count: 0, minPrice: Infinity, maxPrice: 0 };
    }
    byDev[p.development].count++;
    const precio = p.price_equipped || p.price;
    if (precio < byDev[p.development].minPrice) byDev[p.development].minPrice = precio;
    if (precio > byDev[p.development].maxPrice) byDev[p.development].maxPrice = precio;
  }

  for (const [dev, info] of Object.entries(byDev).sort()) {
    console.log(`${dev}: ${info.count} modelos | $${(info.minPrice/1000000).toFixed(2)}M - $${(info.maxPrice/1000000).toFixed(2)}M`);
  }

  console.log('\n✅ Actualización completada!');
}

updatePrices().catch(console.error);
