// Script para ver estructura de properties
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function getStructure() {
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .limit(1);
  
  if (data && data[0]) {
    console.log('Campos disponibles:');
    console.log(Object.keys(data[0]));
  }
}

getStructure();
