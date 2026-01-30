# Database Schema - SARA Backend

> **Base de datos:** Supabase (PostgreSQL)
> **Última actualización:** 2026-01-30

---

## Índice

1. [leads](#leads)
2. [team_members](#team_members)
3. [appointments](#appointments)
4. [properties](#properties)
5. [mortgage_applications](#mortgage_applications)
6. [pending_videos](#pending_videos)
7. [offers](#offers)
8. [surveys](#surveys)
9. [system_config](#system_config)
10. [Tablas Secundarias](#tablas-secundarias)

---

## leads

Tabla principal de prospectos/clientes.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `phone` | TEXT | Teléfono WhatsApp (único) |
| `name` | TEXT | Nombre del lead |
| `status` | TEXT | Estado en funnel (ver estados abajo) |
| `score` | INTEGER | Score de calificación (0-100) |
| `budget` | NUMERIC | Presupuesto del cliente |
| `property_interest` | TEXT | Desarrollo de interés |
| `assigned_to` | UUID | FK → team_members.id |
| `source` | TEXT | Fuente (facebook, whatsapp, referido, etc.) |
| `conversation_history` | JSONB | Array de mensajes |
| `notes` | JSONB | Notas del equipo |
| `resources_sent_for` | TEXT[] | Desarrollos con recursos enviados |
| `last_message_at` | TIMESTAMP | Último mensaje del lead |
| `last_sara_interaction` | TIMESTAMP | Última interacción de SARA |
| `asesor_banco_id` | UUID | FK → team_members.id (asesor hipotecario) |
| `created_at` | TIMESTAMP | Fecha de creación |
| `updated_at` | TIMESTAMP | Última actualización |

### Estados del Lead (status)

```
new → contacted → qualified → visit_scheduled → visited → negotiating → reserved → sold → delivered
                                                                    ↘ lost
                                                                    ↘ inactive
```

| Status | Descripción |
|--------|-------------|
| `new` | Lead recién llegado |
| `contacted` | Ya se contactó |
| `qualified` | Calificado (interés real) |
| `visit_scheduled` | Cita agendada |
| `visited` | Ya visitó desarrollo |
| `negotiating` | En negociación |
| `reserved` | Apartó propiedad |
| `sold` | Venta cerrada |
| `delivered` | Propiedad entregada |
| `lost` | Lead perdido |
| `inactive` | Sin actividad |

### conversation_history (JSONB)

```json
[
  {
    "role": "user",
    "content": "Hola, busco casa",
    "timestamp": "2026-01-30T10:00:00Z"
  },
  {
    "role": "assistant",
    "content": "¡Hola! Soy SARA...",
    "timestamp": "2026-01-30T10:00:05Z"
  }
]
```

### notes (JSONB)

```json
{
  "manual": [
    {
      "text": "Cliente interesado en Monte Verde",
      "author": "Oscar Castelo",
      "timestamp": "2026-01-30T10:00:00Z"
    }
  ],
  "system": [
    {
      "text": "Lead reasignado a Francisco",
      "timestamp": "2026-01-30T10:00:00Z"
    }
  ]
}
```

---

## team_members

Miembros del equipo (vendedores, coordinadores, etc.)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `phone` | TEXT | Teléfono WhatsApp (único) |
| `name` | TEXT | Nombre completo |
| `role` | TEXT | Rol (ver roles abajo) |
| `active` | BOOLEAN | Si está activo |
| `last_sara_interaction` | TIMESTAMP | Último mensaje a SARA (ventana 24h) |
| `pending_briefing` | TEXT | Briefing pendiente de entregar |
| `pending_recap` | TEXT | Recap pendiente de entregar |
| `pending_reporte_diario` | TEXT | Reporte 7PM pendiente |
| `pending_reporte_semanal` | TEXT | Reporte semanal pendiente |
| `monthly_goal` | INTEGER | Meta de ventas mensual |
| `monthly_sales` | INTEGER | Ventas del mes actual |
| `created_at` | TIMESTAMP | Fecha de creación |

### Roles

| Rol | Descripción |
|-----|-------------|
| `admin` | CEO/Administrador (acceso total) |
| `vendedor` | Vendedor de piso |
| `coordinador` | Coordinador de ventas |
| `asesor` | Asesor hipotecario |
| `agencia` | Agencia de marketing |

---

## appointments

Citas agendadas.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `lead_id` | UUID | FK → leads.id |
| `scheduled_date` | DATE | Fecha de la cita |
| `scheduled_time` | TIME | Hora de la cita |
| `appointment_type` | TEXT | Tipo (visita, llamada, videollamada) |
| `development` | TEXT | Desarrollo a visitar |
| `status` | TEXT | Status (scheduled, completed, cancelled, no_show) |
| `vendor_id` | UUID | FK → team_members.id |
| `notes` | TEXT | Notas de la cita |
| `google_event_id` | TEXT | ID del evento en Google Calendar |
| `created_at` | TIMESTAMP | Fecha de creación |
| `updated_at` | TIMESTAMP | Última actualización |

---

## properties

Catálogo de propiedades/desarrollos.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `name` | TEXT | Nombre del modelo (ej: "Acacia") |
| `development` | TEXT | Nombre del desarrollo (ej: "Monte Verde") |
| `price_min` | NUMERIC | Precio mínimo |
| `price_max` | NUMERIC | Precio máximo |
| `bedrooms` | INTEGER | Número de recámaras |
| `bathrooms` | NUMERIC | Número de baños |
| `construction_m2` | NUMERIC | Metros cuadrados construcción |
| `land_m2` | NUMERIC | Metros cuadrados terreno |
| `gps_url` | TEXT | URL de ubicación Google Maps |
| `brochure_url` | TEXT | URL del brochure PDF |
| `video_url` | TEXT | URL del video |
| `matterport_url` | TEXT | URL del tour 3D |
| `features` | TEXT[] | Características (alberca, vigilancia, etc.) |
| `available` | BOOLEAN | Si está disponible |
| `created_at` | TIMESTAMP | Fecha de creación |

---

## mortgage_applications

Solicitudes de crédito hipotecario.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `lead_id` | UUID | FK → leads.id |
| `status` | TEXT | Estado (pending, in_review, pre_approved, approved, rejected) |
| `assigned_advisor_id` | UUID | FK → team_members.id |
| `bank` | TEXT | Banco seleccionado |
| `credit_type` | TEXT | Tipo (INFONAVIT, FOVISSSTE, bancario, cofinavit) |
| `monthly_income` | NUMERIC | Ingreso mensual declarado |
| `requested_amount` | NUMERIC | Monto solicitado |
| `approved_amount` | NUMERIC | Monto aprobado |
| `documents` | JSONB | Lista de documentos entregados |
| `notes` | TEXT | Notas del asesor |
| `created_at` | TIMESTAMP | Fecha de creación |
| `updated_at` | TIMESTAMP | Última actualización |

---

## pending_videos

Videos Veo 3 en proceso de generación.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `lead_id` | UUID | FK → leads.id |
| `phone` | TEXT | Teléfono del lead |
| `status` | TEXT | Estado (pending, generating, uploading, sent, failed) |
| `veo_operation_id` | TEXT | ID de operación en Veo 3 |
| `video_url` | TEXT | URL del video generado |
| `media_id` | TEXT | Media ID en Meta |
| `prompt` | TEXT | Prompt usado para generación |
| `error` | TEXT | Mensaje de error si falló |
| `created_at` | TIMESTAMP | Fecha de creación |
| `completed_at` | TIMESTAMP | Fecha de completado |

---

## offers

Ofertas/cotizaciones enviadas a leads.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `lead_id` | UUID | FK → leads.id |
| `vendor_id` | UUID | FK → team_members.id |
| `property_id` | UUID | FK → properties.id |
| `price` | NUMERIC | Precio cotizado |
| `status` | TEXT | Estado (ver ciclo abajo) |
| `sent_at` | TIMESTAMP | Fecha de envío |
| `viewed_at` | TIMESTAMP | Fecha de visualización |
| `response` | TEXT | Respuesta del cliente |
| `rejection_reason` | TEXT | Razón de rechazo |
| `expires_at` | TIMESTAMP | Fecha de expiración |
| `created_at` | TIMESTAMP | Fecha de creación |
| `updated_at` | TIMESTAMP | Última actualización |

### Ciclo de Vida de Oferta

```
draft → sent → viewed → negotiating → accepted → reserved → contracted
                    ↘ rejected
                    ↘ expired
                    ↘ cancelled
```

---

## surveys

Encuestas post-visita y NPS.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `lead_id` | UUID | FK → leads.id |
| `type` | TEXT | Tipo (post_visit, nps, feedback) |
| `rating` | INTEGER | Calificación (1-10) |
| `response` | TEXT | Respuesta abierta |
| `appointment_id` | UUID | FK → appointments.id |
| `created_at` | TIMESTAMP | Fecha de creación |

---

## system_config

Configuración del sistema.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `key` | TEXT | Primary key |
| `value` | JSONB | Valor de configuración |
| `updated_at` | TIMESTAMP | Última actualización |

### Keys Comunes

| Key | Descripción |
|-----|-------------|
| `broadcasts_enabled` | Si broadcasts están activos |
| `emergency_stop` | Si sistema está detenido |
| `business_hours` | Horario de atención |
| `followup_rules` | Reglas de follow-up |

---

## Tablas Secundarias

### lead_activities

Registro de actividades por lead.

| Campo | Tipo |
|-------|------|
| `id` | UUID |
| `lead_id` | UUID |
| `activity_type` | TEXT |
| `description` | TEXT |
| `performed_by` | UUID |
| `created_at` | TIMESTAMP |

### scheduled_followups

Follow-ups programados.

| Campo | Tipo |
|-------|------|
| `id` | UUID |
| `lead_id` | UUID |
| `scheduled_for` | TIMESTAMP |
| `type` | TEXT |
| `message` | TEXT |
| `completed` | BOOLEAN |

### monthly_goals

Metas mensuales de la empresa.

| Campo | Tipo |
|-------|------|
| `id` | UUID |
| `month` | TEXT (YYYY-MM) |
| `company_goal` | INTEGER |
| `actual` | INTEGER |

### vendor_monthly_goals

Metas mensuales por vendedor.

| Campo | Tipo |
|-------|------|
| `id` | UUID |
| `month` | TEXT |
| `vendor_id` | UUID |
| `goal` | INTEGER |
| `actual` | INTEGER |

### marketing_campaigns

Campañas de marketing.

| Campo | Tipo |
|-------|------|
| `id` | UUID |
| `name` | TEXT |
| `source` | TEXT |
| `budget` | NUMERIC |
| `leads_count` | INTEGER |
| `cost_per_lead` | NUMERIC |
| `active` | BOOLEAN |

### broadcast_queue

Cola de mensajes broadcast.

| Campo | Tipo |
|-------|------|
| `id` | UUID |
| `phone` | TEXT |
| `message` | TEXT |
| `status` | TEXT |
| `scheduled_for` | TIMESTAMP |
| `sent_at` | TIMESTAMP |

---

## Índices Recomendados

```sql
-- Búsqueda de leads por teléfono
CREATE INDEX idx_leads_phone ON leads(phone);

-- Leads por vendedor asignado
CREATE INDEX idx_leads_assigned_to ON leads(assigned_to);

-- Leads por status
CREATE INDEX idx_leads_status ON leads(status);

-- Citas por fecha
CREATE INDEX idx_appointments_date ON appointments(scheduled_date);

-- Team members por teléfono
CREATE INDEX idx_team_members_phone ON team_members(phone);

-- Team members activos
CREATE INDEX idx_team_members_active ON team_members(active) WHERE active = true;
```

---

## Relaciones

```
leads
  ├── assigned_to → team_members.id
  ├── asesor_banco_id → team_members.id
  └── ← appointments.lead_id
  └── ← mortgage_applications.lead_id
  └── ← pending_videos.lead_id
  └── ← offers.lead_id
  └── ← surveys.lead_id
  └── ← lead_activities.lead_id

team_members
  └── ← leads.assigned_to
  └── ← appointments.vendor_id
  └── ← offers.vendor_id

properties
  └── ← offers.property_id

appointments
  └── ← surveys.appointment_id
```
