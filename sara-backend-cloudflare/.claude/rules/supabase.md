# Reglas para Supabase (PostgreSQL)

## Conexión

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY
);
```

---

## Tablas Principales

| Tabla | Propósito | Campos clave |
|-------|-----------|--------------|
| `leads` | Prospectos | phone, name, status, assigned_to, score |
| `team_members` | Equipo | phone, name, role, active |
| `appointments` | Citas | lead_id, scheduled_date, scheduled_time, appointment_type |
| `properties` | Desarrollos | name, price_min, price_max, gps_url |
| `mortgage_applications` | Créditos | lead_id, status, assigned_advisor_id |
| `conversation_history` | Historial | lead_id, messages (JSONB) |
| `monthly_goals` | Metas empresa | month, company_goal |
| `vendor_monthly_goals` | Metas vendedor | month, vendor_id, goal |

---

## Queries Comunes

### Buscar lead por teléfono
```typescript
const { data: lead } = await supabase
  .from('leads')
  .select('*')
  .like('phone', `%${digits}`)
  .single();
```

### Buscar lead por nombre (fuzzy)
```typescript
const { data: leads } = await supabase
  .from('leads')
  .select('*')
  .ilike('name', `%${nombre}%`)
  .limit(5);
```

### Leads de un vendedor
```typescript
const { data: leads } = await supabase
  .from('leads')
  .select('*')
  .eq('assigned_to', vendedorId)
  .order('created_at', { ascending: false });
```

### Citas de hoy
```typescript
const hoy = new Date().toISOString().split('T')[0];
const { data: citas } = await supabase
  .from('appointments')
  .select('*, leads(*)')
  .eq('scheduled_date', hoy)
  .order('scheduled_time');
```

---

## Estados de Lead (Funnel)

```typescript
type LeadStatus =
  | 'new'         // Recién llegado
  | 'contacted'   // Contactado
  | 'scheduled'   // Cita agendada
  | 'visited'     // Visitó desarrollo
  | 'negotiation' // En negociación
  | 'reserved'    // Apartó
  | 'closed'      // Cerró venta
  | 'delivered'   // Entregado
  | 'lost'        // Perdido
  | 'inactive';   // Inactivo
```

---

## Roles de Team Member

```typescript
type Role =
  | 'admin'       // CEO/Admin
  | 'vendedor'    // Vendedor
  | 'coordinador' // Coordinador
  | 'asesor'      // Asesor hipotecario
  | 'agencia';    // Agencia de marketing
```

---

## JSONB Fields

### conversation_history.messages
```typescript
interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}
```

### leads.notes
```typescript
interface Note {
  text: string;
  author: string;
  timestamp: string;
  type: 'whatsapp' | 'manual' | 'system';
}
```

---

## Upsert (Insert or Update)

```typescript
// Por conflicto de campo único
await supabase
  .from('monthly_goals')
  .upsert({
    month: '2026-01',
    company_goal: 5
  }, { onConflict: 'month' });

// Por múltiples campos
await supabase
  .from('vendor_monthly_goals')
  .upsert({
    month: '2026-01',
    vendor_id: 'xxx',
    goal: 2
  }, { onConflict: 'month,vendor_id' });
```

---

## Transacciones (RPC)

```sql
-- Crear función en Supabase
CREATE OR REPLACE FUNCTION transfer_lead(
  lead_id UUID,
  new_vendor_id UUID
) RETURNS void AS $$
BEGIN
  UPDATE leads SET assigned_to = new_vendor_id WHERE id = lead_id;
  INSERT INTO lead_transfers (lead_id, new_vendor_id) VALUES (lead_id, new_vendor_id);
END;
$$ LANGUAGE plpgsql;
```

```typescript
// Llamar desde código
await supabase.rpc('transfer_lead', {
  lead_id: 'xxx',
  new_vendor_id: 'yyy'
});
```

---

## Realtime (Solo en CRM Frontend)

```typescript
const subscription = supabase
  .channel('leads-realtime')
  .on('postgres_changes',
    { event: '*', schema: 'public', table: 'leads' },
    (payload) => {
      console.log('Cambio en leads:', payload);
      refetchLeads();
    }
  )
  .subscribe();
```

---

## Errores Comunes

### 1. Unique constraint violation
```
Error: duplicate key value violates unique constraint
```
**Solución**: Usar upsert con onConflict

### 2. Foreign key violation
```
Error: insert or update violates foreign key constraint
```
**Solución**: Verificar que el registro padre existe

### 3. Row level security
```
Error: new row violates row-level security policy
```
**Solución**: Verificar políticas RLS o usar service_role key
