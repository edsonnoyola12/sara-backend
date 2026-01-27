# API Reference - SARA Backend

## Autenticación

Todos los endpoints (excepto `/webhook`, `/health`, `/`) requieren autenticación.

```bash
# Header
Authorization: Bearer <API_SECRET>

# O query param
?api_key=<API_SECRET>
```

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

## Endpoints de Testing

### GET /test-real?test=X
Ejecutar tests de funcionalidad.

**Tests disponibles:**
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
| `setup-dashboard` | Configura datos del dashboard |
| `all` | Ejecuta todos los tests |

```bash
curl "https://sara-backend.edson-633.workers.dev/test-real?test=mensaje&api_key=XXX"
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
