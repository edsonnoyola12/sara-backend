# API Reference - SARA Backend

> **Base URL:** `https://sara-backend.edson-633.workers.dev`
> **Última actualización:** 2026-02-05

---

## Índice

1. [Autenticación](#autenticación)
2. [Endpoints Públicos](#endpoints-públicos)
3. [Leads](#leads)
4. [Citas (Appointments)](#citas-appointments)
5. [Propiedades](#propiedades)
6. [Créditos Hipotecarios](#créditos-hipotecarios)
7. [Dashboard y Reportes](#dashboard-y-reportes)
8. [Webhooks](#webhooks)
9. [Calendario](#calendario)
10. [Templates WhatsApp](#templates-whatsapp)
11. [Testing y Debug](#testing-y-debug)
12. [Sistema](#sistema)
13. [Encuestas (CRM)](#encuestas-crm)
14. [Métricas de Mensajes (CRM)](#métricas-de-mensajes-crm)
15. [Servicios Internos](#servicios-internos)

---

## Autenticación

Todos los endpoints `/api/*` y `/test-*` requieren autenticación.

```bash
# Header (recomendado)
Authorization: Bearer <API_SECRET>

# O query param
?api_key=<API_SECRET>
```

### Endpoints que NO requieren auth:
- `/webhook/*` - Webhooks (usan sus propios tokens)
- `/health` - Health check
- `/status` - Dashboard HTML
- `/analytics` - Analytics HTML
- `/api/properties` - Catálogo público
- `/api/surveys` - Encuestas (CRM)
- `/api/send-surveys` - Enviar encuestas (CRM)
- `/api/message-metrics` - Métricas de mensajes (CRM)
- `/api/tts-metrics` - Métricas de TTS (CRM)

---

## Endpoints Públicos

### GET /
Status general del sistema.

```json
{
  "name": "SARA Backend",
  "version": "1.0.0",
  "status": "healthy"
}
```

### GET /health
Health check detallado.

```json
{
  "timestamp": "2026-01-27T22:00:00.000Z",
  "status": "healthy",
  "checks": {
    "supabase": { "status": "ok", "leads_count": 7 },
    "followups": { "status": "ok", "pending": null },
    "videos": { "status": "ok", "pending": null }
  },
  "metrics": {
    "leads_today": 4,
    "appointments_today": 1
  }
}
```

### POST /webhook
Webhook de Meta WhatsApp. No requiere API_SECRET (usa META_WEBHOOK_SECRET).

---

## Endpoints de Datos

### GET /api/leads
Lista de leads.

**Query params:**
- `limit` - Máximo de resultados (default: 100)
- `status` - Filtrar por status
- `assigned_to` - Filtrar por vendedor

```json
[
  {
    "id": "uuid",
    "phone": "5215551234567",
    "name": "Juan Pérez",
    "status": "new",
    "score": 45,
    "budget": 2500000,
    "property_interest": "Monte Verde",
    "assigned_to": "vendor-uuid",
    "created_at": "2026-01-27T10:00:00Z"
  }
]
```

### GET /api/team-members
Lista de miembros del equipo.

```json
[
  {
    "id": "uuid",
    "phone": "5212224558475",
    "name": "Oscar Castelo",
    "role": "admin",
    "active": true
  }
]
```

### GET /api/properties
Lista de desarrollos/propiedades.

```json
[
  {
    "id": "uuid",
    "name": "Monte Verde",
    "price_min": 1500000,
    "price_max": 3000000,
    "gps_url": "https://maps.google.com/...",
    "brochure_url": "https://...",
    "video_url": "https://..."
  }
]
```

### GET /api/team
Dashboard del equipo (resumen).

```json
{
  "success": true,
  "summary": {
    "total_leads": 7,
    "leads_today": 4,
    "appointments_today": 1
  }
}
```

---

## Leads

### POST /api/leads
Crear nuevo lead.

```json
{
  "name": "Juan Pérez",
  "phone": "5214921234567",
  "property_interest": "Monte Verde",
  "source": "facebook"
}
```

### GET /api/leads/:id
Obtener lead por ID.

### PUT /api/leads/:id
Actualizar lead.

```json
{
  "status": "contacted",
  "notes": "Cliente interesado"
}
```

### DELETE /api/leads/:id
Eliminar lead.

### POST /api/recalculate-scores
Recalcular scores de todos los leads.

### POST /api/leads/notify-note
Notificar nota agregada desde CRM.

```json
{
  "leadId": "uuid",
  "note": "Texto de la nota",
  "author": "Nombre"
}
```

### POST /api/leads/notify-reassign
Notificar reasignación de lead.

```json
{
  "leadId": "uuid",
  "newVendorId": "uuid",
  "oldVendorId": "uuid"
}
```

---

## Citas (Appointments)

### GET /api/appointments
Listar citas.

**Query params:**
| Param | Descripción |
|-------|-------------|
| `start_date` | Fecha inicio (YYYY-MM-DD) |
| `end_date` | Fecha fin (YYYY-MM-DD) |
| `vendor_id` | Filtrar por vendedor |

### POST /api/appointments
Crear cita.

```json
{
  "lead_id": "uuid",
  "scheduled_date": "2026-02-01",
  "scheduled_time": "11:00",
  "appointment_type": "visita",
  "development": "Monte Verde"
}
```

### PUT /api/appointments/:id
Actualizar cita.

### POST /api/appointments/:id/cancel
Cancelar cita.

```json
{
  "reason": "Cliente no disponible"
}
```

### POST /api/appointments/notify-change
Notificar cambio de cita al lead.

---

## Créditos Hipotecarios

### GET /api/mortgages
### GET /api/mortgage_applications
Listar solicitudes de crédito.

### GET /api/mortgages/:id
Obtener solicitud.

### PUT /api/mortgages/:id
Actualizar solicitud.

```json
{
  "status": "pre_approved",
  "bank": "BBVA",
  "approved_amount": 2500000
}
```

---

## Dashboard y Reportes

### GET /api/dashboard/kpis
KPIs del dashboard.

```json
{
  "leads_today": 15,
  "appointments_today": 5,
  "conversion_rate": 0.23
}
```

### GET /api/reportes/diario
Reporte diario.

### GET /api/reportes/semanal
Reporte semanal.

### GET /api/reportes/mensual
Reporte mensual.

### POST /api/reportes/ask
Consulta con IA.

```json
{
  "question": "¿Cuántos leads nuevos esta semana?"
}
```

### POST /api/dashboard/ask
Consulta dashboard con IA.

### GET /api/metrics/conversation
Métricas de conversación de los últimos N días.

**Query params:**
- `days` (opcional, default: 7)

```json
{
  "periodo": "últimos 7 días",
  "leads": {
    "total": 45,
    "con_conversacion": 38,
    "por_status": { "new": 10, "contacted": 15, "scheduled": 8 }
  },
  "conversaciones": {
    "total_mensajes": 320,
    "mensajes_usuario": 180,
    "mensajes_sara": 140,
    "promedio_por_lead": 8
  },
  "intenciones": { "saludo": 45, "precio": 30, "cita": 25 },
  "objeciones": { "muy caro": 8, "lo voy a pensar": 5 }
}
```

### GET /api/metrics/quality
Reporte de calidad de respuestas de SARA.

**Query params:**
- `days` (opcional, default: 7)

```json
{
  "periodo": "últimos 7 días",
  "resumen": {
    "leads_analizados": 45,
    "total_respuestas_sara": 140,
    "respuestas_ok": 138,
    "respuestas_con_problemas": 2,
    "tasa_calidad": 99
  },
  "problemas_por_tipo": {
    "truncada": 1,
    "nombre_hallucinated": 1
  },
  "ultimos_problemas": [
    {
      "lead_name": "Sin nombre",
      "problemas": ["nombre_hallucinated:María"],
      "preview": "¡Hola María! Tenemos casas..."
    }
  ],
  "recomendaciones": [
    "Reforzar eliminación de nombres inventados"
  ]
}
```

---

## Webhooks

### GET/POST /webhook/meta
Webhook de Meta WhatsApp Business.
- GET: Verificación con `hub.verify_token=sara_verify_token`
- POST: Recibe mensajes

### GET/POST /webhook/facebook-leads
Webhook de Facebook Lead Ads.
- GET: Verificación con `hub.verify_token=sara_fb_leads_token`
- POST: Recibe leads

### POST /webhook/google-calendar
Webhook de Google Calendar.

---

## Calendario

### POST /api/events
Crear evento en Google Calendar.

### GET /api/events
Listar eventos.

### POST /api/events/invite
Enviar invitación.

### POST /api/calendar/cleanup
Limpiar eventos duplicados.

### POST /api/calendar/setup-webhook
Configurar webhook.

---

## Templates WhatsApp

### GET /api/templates
Listar templates.

### POST /api/create-all-templates
Crear todos los templates.

### POST /api/send-template
Enviar template.

```json
{
  "phone": "5214921234567",
  "template": "bienvenida",
  "params": ["Juan"]
}
```

---

## Sistema

### POST /api/emergency-stop
Detener broadcasts y CRONs.

### POST /api/broadcasts-enable
Habilitar broadcasts.

### GET /api/system-status
Estado del sistema.

### GET /api/diagnostico
Diagnóstico completo.

---

## Endpoints de Testing

> ⚠️ **Todos requieren API key**

### GET /test-ai-response
Probar respuesta de SARA sin enviar WhatsApp.

```bash
curl "https://...?msg=Hola&api_key=XXX"
```

**Response:**
```json
{
  "ok": true,
  "pregunta": "Hola",
  "respuesta_sara": "¡Hola! Soy SARA...",
  "tiempo_ms": 3015
}
```

### GET /test-lead
Simular flujo completo como lead (SÍ envía WhatsApp).

```bash
curl "https://...?phone=5214921234567&name=Test&msg=Hola&api_key=XXX"
```

### GET /test-vendedor-msg
Simular comando de vendedor/CEO.

```bash
curl "https://...?phone=5214921234567&msg=briefing&api_key=XXX"
```

### GET /test-real?test=X
Ejecutar tests de funcionalidad.

| Test | Descripción |
|------|-------------|
| `mensaje` | Envía mensaje de prueba |
| `briefing` | Envía briefing matutino |
| `reporte` | Envía reporte diario CEO |
| `alerta` | Simula alerta de lead caliente |
| `comando` | Prueba comando ventas |
| `video` | Genera video de prueba |
| `recap` | Envía recap 7pm |
| `followup` | Simula follow-up pendiente |
| `all` | Ejecuta todos los tests |

### GET /test-cron
Ejecutar CRONs manualmente.

### GET /test-briefing
Probar briefing matutino.

### GET /test-comando-ceo
Probar comando de CEO.

### GET /test-comando-vendedor
Probar comando de vendedor.

### POST /test-update-dates
Actualizar fechas de lead para pruebas de CRONs post-compra.

```bash
curl -X POST "https://...?api_key=XXX" \
  -H "Content-Type: application/json" \
  -d '{"phone": "5214921234567", "delivery_date": "2025-01-25", "purchase_date": "2025-01-15"}'
```

**Body params:**
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `phone` | string | Teléfono del lead (requerido) |
| `delivery_date` | string | Fecha de entrega (ISO 8601) |
| `purchase_date` | string | Fecha de compra (ISO 8601) |
| `status_changed_at` | string | Fecha de cambio de status (ISO 8601) |

**Response:**
```json
{
  "ok": true,
  "updated": [{
    "id": "xxx",
    "name": "Test Lead",
    "phone": "5214921234567",
    "delivery_date": "2025-01-25",
    "purchase_date": "2025-01-15",
    "status_changed_at": "2025-01-15T00:00:00Z"
  }]
}
```

### GET /test-interactive-responses
Probar extracción de mensajes interactivos (list_reply, button_reply).

```bash
curl "https://...?api_key=XXX"
```

**Response:**
```json
{
  "ok": true,
  "summary": {
    "total_tests": 3,
    "passed": 3,
    "failed": 0
  },
  "extraction_tests": [
    {
      "test": "Extracción list_reply",
      "input": { "type": "interactive", "interactive": { "type": "list_reply", "list_reply": { "id": "2" } } },
      "extracted": "2",
      "passed": true
    }
  ],
  "interactive_messages_catalog": [
    { "nombre": "¿LLEGÓ? (No-show check)", "opciones": ["1 = Sí llegó", "2 = No llegó"] },
    { "nombre": "Encuesta NPS", "opciones": ["0-10"] },
    { "nombre": "Satisfacción casa", "opciones": ["1-4"] }
  ]
}
```

---

## Endpoints de Debug

### GET /debug-lead?phone=X
Información detallada de un lead.

### GET /debug-vendedor?phone=X
Identificar vendedor por teléfono.

### GET /debug-citas?phone=X
Ver citas de un lead.

### GET /debug-followup?phone=X
Ver follow-ups pendientes de un lead.

### GET /debug-cache
Estadísticas del cache KV.

### GET /debug-videos
Estado de videos pendientes.

---

## Flujos Post-Compra

Endpoints para ejecutar manualmente los flujos automáticos de post-compra.

### GET /run-post-entrega
Ejecutar seguimiento post-entrega (3-7 días después de entrega).
Verifica: llaves, escrituras, servicios.

```json
{
  "message": "Seguimiento post-entrega ejecutado."
}
```

### GET /run-satisfaccion-casa
Ejecutar encuesta de satisfacción con la casa (3-6 meses post-entrega).
Calificación: 1 (Excelente) - 4 (Mala).

```json
{
  "message": "Encuestas de satisfacción con la casa enviadas."
}
```

### GET /run-mantenimiento
Ejecutar check-in de mantenimiento (~1 año post-entrega).
Incluye checklist de mantenimiento preventivo.

```json
{
  "message": "Check-in de mantenimiento ejecutado."
}
```

### GET /run-referidos
Solicitar referidos a clientes satisfechos (30-90 días post-compra).

```json
{
  "message": "Solicitud de referidos ejecutada."
}
```

### GET /run-nps
Enviar encuestas NPS (7-30 días post-visita/compra).
Escala: 0-10 (Detractor/Pasivo/Promotor).

```json
{
  "message": "Encuestas NPS enviadas."
}
```

### GET /run-nurturing
Enviar contenido educativo sobre crédito y compra de casa.

```json
{
  "message": "Nurturing educativo ejecutado."
}
```

---

## Servicios Internos

### MetaWhatsAppService

```typescript
// Enviar mensaje de texto
await meta.sendWhatsAppMessage(phone: string, message: string)

// Enviar imagen por URL
await meta.sendWhatsAppImage(phone: string, imageUrl: string, caption?: string)

// Enviar video por Media ID
await meta.sendWhatsAppVideoById(phone: string, mediaId: string, caption?: string)

// Subir video desde buffer
const mediaId = await meta.uploadVideoFromBuffer(buffer: Buffer, mimeType: string)

// Enviar template
await meta.sendTemplate(phone: string, templateName: string, params: any[])

// Enviar botones
await meta.sendWhatsAppButtons(phone: string, text: string, buttons: Button[])

// Enviar lista
await meta.sendWhatsAppList(phone: string, text: string, buttonText: string, items: Item[])
```

### SupabaseService

```typescript
// Obtener o crear lead
const { lead, isNew } = await supabase.getOrCreateLead(phone: string)

// Buscar lead por nombre
const leads = await supabase.findLeadByName(name: string, vendorId?: string)

// Actualizar lead
await supabase.updateLead(leadId: string, data: Partial<Lead>)

// Buscar team member por teléfono
const member = await supabase.findTeamMemberByPhone(phone: string)
```

### AIConversationService

```typescript
// Procesar mensaje de lead
const response = await ai.processLeadMessage(
  lead: Lead,
  message: string,
  conversationHistory: Message[]
)

// Detectar intención
const intent = await ai.detectIntent(message: string)

// Generar respuesta inteligente (para comandos no reconocidos)
const suggestion = await ai.generateSmartResponse(message: string, role: string)
```

### BridgeService

```typescript
// Activar bridge
await bridge.activarBridge(
  teamMemberId: string,
  leadPhone: string,
  leadName: string,
  duracionMinutos: number
)

// Verificar si hay bridge activo
const bridgeActivo = await bridge.getBridgeActivo(phone: string)

// Cerrar bridge
await bridge.cerrarBridge(bridgeId: string)

// Extender bridge
await bridge.extenderBridge(bridgeId: string, minutosExtra: number)
```

---

## Encuestas (CRM)

### GET /api/surveys
Listar encuestas enviadas desde el CRM.

```bash
GET /api/surveys?status=all
```

**Filtros disponibles:** `all`, `sent`, `answered`, `awaiting_feedback`

```json
{
  "surveys": [
    {
      "id": "uuid",
      "lead_id": "uuid",
      "lead_name": "Roberto García",
      "phone": "5610016226",
      "template_type": "nps",
      "status": "answered",
      "nps_score": 9,
      "nps_category": "promotor",
      "feedback": "Excelente atención",
      "sent_at": "2026-02-05T...",
      "answered_at": "2026-02-05T..."
    }
  ],
  "metrics": {
    "total": 2,
    "answered": 1,
    "avg_nps": 9.0,
    "promoters": 1,
    "passives": 0,
    "detractors": 0
  }
}
```

### POST /api/send-surveys
Enviar encuesta a uno o más leads/vendedores.

```json
{
  "template": {
    "name": "NPS - Net Promoter Score",
    "type": "nps",
    "greeting": "Hola {nombre}...",
    "questions": [
      { "text": "Del 0 al 10, ¿qué tan probable es que nos recomiendes?", "type": "rating" }
    ],
    "closing": "¡Gracias!"
  },
  "leads": [
    { "id": "uuid", "phone": "5610016226", "name": "Roberto" }
  ],
  "targetType": "leads"
}
```

---

## Métricas de Mensajes (CRM)

### GET /api/message-metrics
Métricas de mensajes WhatsApp enviados/recibidos.

```json
{
  "metrics": {
    "total_messages": 150,
    "by_type": { "text": 120, "template": 20, "image": 10 },
    "by_direction": { "outgoing": 100, "incoming": 50 },
    "by_day": [...]
  }
}
```

### GET /api/tts-metrics
Métricas de mensajes de voz TTS generados.

```json
{
  "metrics": {
    "total_generated": 25,
    "total_sent": 23,
    "avg_duration_seconds": 8.5
  }
}
```

---

## Códigos de Error

| Código | Significado |
|--------|-------------|
| 200 | OK |
| 400 | Bad Request - Parámetros inválidos |
| 401 | Unauthorized - Falta API_SECRET |
| 403 | Forbidden - API_SECRET inválido |
| 404 | Not Found - Recurso no existe |
| 429 | Too Many Requests - Rate limit |
| 500 | Internal Error - Error del servidor |

```json
{
  "error": "Not Found",
  "message": "Lead not found",
  "code": 404
}
```
