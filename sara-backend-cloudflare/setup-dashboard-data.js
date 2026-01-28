// Script para configurar datos realistas del Dashboard
// Ejecutar con: node setup-dashboard-data.js

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://bpxnknoldqyjacvlxqzl.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJweG5rbm9sZHF5amFjdmx4cXpsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0OTUwMDMwNywiZXhwIjoyMDY1MDc2MzA3fQ.3SBwHmUj1FeYjLDsfTkRBMl_0h9pVpOcbmQyrPN-stk';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function setup() {
  console.log('🚀 Configurando datos del Dashboard...\n');

  // 1. Crear metas mensuales
  console.log('1️⃣ Creando metas mensuales...');
  const month = '2026-01';
  
  // Meta de empresa
  await supabase.from('monthly_goals').upsert({
    month,
    company_goal: 5,
    vendor_id: null
  }, { onConflict: 'month,vendor_id' });
  console.log('   ✅ Meta empresa: 5 casas/mes');

  // Metas por vendedor
  const vendedores = [
    { id: '7bb05214-826c-4d1b-a418-228b8d77bd64', name: 'Vendedor Test', goal: 2 },
    { id: 'a1ffd78f-5c03-4c98-9968-8443a5670ed8', name: 'Fabian Fernandez', goal: 1 },
    { id: '451742c2-38a2-4741-8ba4-90185ab7f023', name: 'Francisco de la Torre', goal: 1 },
    { id: 'd81f53e8-25b3-45d5-99a5-aeb8eadbdf81', name: 'Javier Frausto', goal: 1 }
  ];

  for (const v of vendedores) {
    await supabase.from('monthly_goals').upsert({
      month,
      vendor_id: v.id,
      goal: v.goal
    }, { onConflict: 'month,vendor_id' });
    console.log(`   ✅ ${v.name}: ${v.goal} casa(s)/mes`);
  }

  // 2. Actualizar leads existentes con presupuestos
  console.log('\n2️⃣ Actualizando leads con presupuestos...');
  
  const { data: leads } = await supabase.from('leads').select('id, name, phone');
  
  const updates = [
    { phone_suffix: '5510001234', name: 'Carlos Mendoza', budget: 2500000, score: 45, status: 'contacted' },
    { phone_suffix: '5610016226', name: 'Roberto García', budget: 3200000, score: 72, status: 'negotiation' },
    { phone_suffix: '9090486', name: 'María López', budget: 1800000, score: 35, status: 'new' }
  ];

  for (const u of updates) {
    const lead = leads?.find(l => l.phone?.endsWith(u.phone_suffix));
    if (lead) {
      await supabase.from('leads').update({
        name: u.name,
        budget: u.budget,
        score: u.score,
        status: u.status
      }).eq('id', lead.id);
      console.log(`   ✅ ${u.name}: $${(u.budget/1000000).toFixed(1)}M, score ${u.score}`);
    }
  }

  // 3. Crear leads adicionales
  console.log('\n3️⃣ Creando leads adicionales...');
  
  const newLeads = [
    {
      phone: '5215551112222',
      name: 'Juan Pérez',
      property_interest: 'Monte Verde',
      budget: 2100000,
      score: 78,
      status: 'negotiation',
      source: 'Facebook',
      assigned_to: '7bb05214-826c-4d1b-a418-228b8d77bd64'
    },
    {
      phone: '5215553334444',
      name: 'Ana Martínez',
      property_interest: 'Distrito Falco',
      budget: 3500000,
      score: 85,
      status: 'reserved',
      source: 'Instagram',
      assigned_to: 'a1ffd78f-5c03-4c98-9968-8443a5670ed8'
    },
    {
      phone: '5215555556666',
      name: 'Pedro Ramírez',
      property_interest: 'Andes',
      budget: 2800000,
      score: 55,
      status: 'visited',
      source: 'Google',
      assigned_to: '451742c2-38a2-4741-8ba4-90185ab7f023'
    },
    {
      phone: '5215559990000',
      name: 'Miguel Torres',
      property_interest: 'Monte Verde',
      budget: 2300000,
      score: 90,
      status: 'closed',
      source: 'Referidos',
      assigned_to: '7bb05214-826c-4d1b-a418-228b8d77bd64',
      status_changed_at: '2026-01-20T10:00:00Z'
    }
  ];

  for (const lead of newLeads) {
    // Verificar si ya existe
    const { data: existing } = await supabase.from('leads').select('id').eq('phone', lead.phone).single();
    if (!existing) {
      await supabase.from('leads').insert(lead);
      console.log(`   ✅ ${lead.name}: ${lead.status}, $${(lead.budget/1000000).toFixed(1)}M`);
    } else {
      console.log(`   ⏭️ ${lead.name}: ya existe`);
    }
  }

  // Verificación final
  console.log('\n📊 RESUMEN FINAL:');
  const { data: finalLeads } = await supabase.from('leads').select('*');
  const { data: goals } = await supabase.from('monthly_goals').select('*').eq('month', month);
  
  console.log(`   Leads: ${finalLeads?.length || 0}`);
  console.log(`   Metas configuradas: ${goals?.length || 0}`);
  
  const totalPipeline = finalLeads?.reduce((sum, l) => sum + (l.budget || 0), 0) || 0;
  console.log(`   Pipeline total: $${(totalPipeline/1000000).toFixed(1)}M`);
  
  const closed = finalLeads?.filter(l => l.status === 'closed').length || 0;
  console.log(`   Cerrados este mes: ${closed}`);

  console.log('\n✅ ¡Configuración completada! Recarga el Dashboard.');
}

setup().catch(console.error);
