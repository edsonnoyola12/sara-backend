# SARA CRM - Documentación de Comandos y Flujos

> **IMPORTANTE**: Lee este archivo al inicio de cada sesión para no repetir trabajo.

---

## ROLES Y DETECCIÓN

| Rol | Detectado por | Handler |
|-----|---------------|---------|
| CEO/Admin/Director | `role` contiene: ceo, admin, director, gerente, dueño, owner | `handleCEOMessage` |
| Asesor Hipotecario | `role` contiene: asesor, hipoteca, credito | `handleAsesorMessage` |
| Agencia/Marketing | `role` contiene: agencia, marketing, mkt | `handleAgenciaMessage` |
| Vendedor | Default si no es ninguno de los anteriores | `handleVendedorMessage` |
| Lead | No está en `team_members` | Flujo de lead en `handleIncomingMessage` |

---

## COMANDOS CEO

| Comando | Acción | Handler |
|---------|--------|---------|
| `ayuda` / `help` / `?` | Ver todos los comandos | Respuesta directa |
| `reporte` | Resumen semanal de leads | `generarReporte` |
| `equipo` | Ver equipo activo | `reporteEquipo` |
| `leads` | Estado de leads | `reporteLeads` |
| `ventas` | Métricas de ventas | `reporteVentas` |
| `hoy` / `resumen` | Resumen del día | `resumenHoy` |
| `citas` / `citas hoy` | Citas de hoy | `vendedorCitasHoy` |
| `broadcast` | Enviar mensaje masivo | `iniciarBroadcast` |
| `segmentos` | Ver segmentos disponibles | `verSegmentos` |
| `eventos` | Ver eventos activos | `verEventos` |
| `mensaje [nombre]` | Enviar mensaje a lead (Sara intermedia) | `ceoMensajeLead` |
| `bridge [nombre]` | Chat directo 6 min | `ceoBridgeLead` |
| `#mas` / `#continuar` | Extender bridge 6 min más | `ceoExtenderBridge` |
| `#cerrar` / `#fin` | Terminar TODAS las conexiones | `ceoCerrarBridge` |
| `actividad` / `bitácora` | Ver actividad del día | `verActividad` |

---

## COMANDOS ASESOR HIPOTECARIO

| Comando | Acción |
|---------|--------|
| `ayuda` | Ver comandos |
| `mis leads` / `leads` | Ver leads asignados |
| `status [nombre]` | Ver detalle de un lead |
| `docs [nombre]` | Pedir documentos al lead |
| `preaprobado [nombre]` | Notificar pre-aprobación |
| `rechazado [nombre] [motivo]` | Notificar rechazo |
| `dile [nombre] que [msg]` | Enviar mensaje vía Sara |
| `llamar [nombre]` | Ver teléfono del lead |
| `adelante [nombre]` | Mover al siguiente paso del funnel |
| `atras [nombre]` | Regresar al paso anterior |
| `contactado [nombre]` | Marcar como contactado |
| `hoy` | Citas de hoy |
| `semana` | Citas de la semana |
| `reporte` | Ver estadísticas |
| `on` / `off` | Activar/pausar disponibilidad |

---

## COMANDOS VENDEDOR

| Comando | Acción | Handler |
|---------|--------|---------|
| `citas` / `mis citas` | Ver citas de hoy | `vendedorCitasHoy` |
| `leads` / `mis leads` | Ver leads activos | `vendedorResumenLeads` |
| `hoy` / `resumen` | Briefing del día | `vendedorBriefing` |
| `meta` | Ver avance de meta mensual | `vendedorMetaAvance` |
| `ayuda` / `help` / `?` | Ver comandos disponibles | `vendedorAyuda` |
| `briefing` | Resumen matutino | `vendedorBriefing` |
| `agendar cita con [nombre]` | Agendar nueva cita | `vendedorAgendarCita` |
| `reagendar [nombre] [día] [hora]` | Reagendar cita existente | `vendedorReagendarCita` |
| `cancelar cita con [nombre]` | Cancelar cita | `vendedorCancelarCita` |
| `#mas` / `#continuar` | Extender bridge 6 min más | - |
| `#cerrar` / `#fin` | Terminar conexiones activas | - |
| Números `1`, `2`, `3`, `4` | Responder a opciones pendientes | - |

---

## FLUJOS DE COMUNICACIÓN

### 1. MENSAJE (Sara como intermediario)

```
CEO/Vendedor: "mensaje Juan"
    ↓
Sara busca lead "Juan"
    ↓
Si hay varios: muestra opciones (1, 2, 3...)
    ↓
CEO/Vendedor escribe el mensaje
    ↓
Lead recibe: "💬 *Mensaje de [Nombre]:* [mensaje]"
    ↓
Lead responde
    ↓
CEO/Vendedor recibe: "💬 *Respuesta de [Lead]:* [mensaje]"
Lead recibe: "✅ Tu mensaje fue enviado a [Nombre]"
```

**Notas guardadas:**
- `team_member.notes.pending_message_to_lead` - Esperando que escriba el mensaje
- `lead.notes.pending_response_to` - Lead puede responder (expira 24h)

### 2. BRIDGE (Chat directo)

```
CEO/Vendedor: "bridge Juan"
    ↓
Si hay varios leads: muestra opciones (1, 2, 3...)
    ↓
Sara activa bridge (6 min)
    ↓
Lead recibe: "🔗 Chat directo activado con [Nombre]"
CEO/Vendedor recibe: "🔗 Bridge activado con [Lead]"
    ↓
Mensajes van con formato simétrico: "💬 *Nombre:* mensaje"
(Ambos lados ven quién escribió)
    ↓
A los ~5 min (via CRON cada 2 min):
  - Vendedor recibe: "⏰ Por terminar con [nombre]\n#mas = 6 min más\n#cerrar = terminar"
  - Lead recibe: "¿Algo más en lo que pueda ayudarte? 🏠"
    ↓
"#mas" → Extiende 6 min más
"#cerrar" → Termina el bridge
```

**Mensajes al cerrar (user-friendly):**
- Lead: `Listo, si necesitas algo más aquí estoy para ayudarte. 🏠`
- Vendedor: `✅ Listo, cerrado.\n\nPara reconectar: bridge [nombre]`

**Notas guardadas:**
- `team_member.notes.active_bridge` - Bridge activo del lado vendedor
- `team_member.notes.active_bridge.warning_sent` - Ya se envió aviso de expiración
- `lead.notes.active_bridge_to_vendedor` - Bridge activo del lado lead

### 3. LEAD PIDE CONTACTO

```
Lead: "Quiero hablar con mi asesor"
    ↓
Sara detecta intención (ANTES de otros flujos)
    ↓
Vendedor recibe: "📞 *[Lead] quiere hablar contigo*"
    ↓
Lead recibe:
  "👤 *[Vendedor]* es tu vendedor.
   📱 WhatsApp: wa.me/[tel]
   📞 Llamar: tel:+[tel]"
```

**Frases detectadas:**
- "hablar con", "contactar", "comunicarme con"
- "necesito hablar", "quiero hablar"
- "pasame con", "conectame con"
- "mi asesor", "mi vendedor"

---

## COMANDO #CERRAR

El comando `#cerrar` (con #) limpia TODO:
1. `active_bridge` del team_member
2. `pending_message_to_lead` del team_member
3. `pending_response_to` de TODOS los leads que apuntan a ese team_member
4. `active_bridge_to_vendedor` del lead

**IMPORTANTE:** Usa `#cerrar` con # para evitar confusión con conversaciones normales (ej: "vamos a cerrar el trato").

---

## CRON - VERIFICACIÓN DE BRIDGES

El CRON ejecuta cada 2 minutos `verificarBridgesPorExpirar()`:
1. Busca team_members con `active_bridge` activo
2. Si quedan 0.5-2 minutos para expirar Y no se ha enviado warning:
   - Envía aviso al vendedor con comandos `#mas` / `#cerrar`
   - Envía mensaje amigable al lead
   - Marca `warning_sent = true`

---

## FLUJO DE CRÉDITO HIPOTECARIO

```
Lead menciona crédito/hipoteca
    ↓
Sara hace preguntas de calificación:
  - ¿Trabajas actualmente?
  - ¿Cuánto ganas al mes?
  - ¿Cuánto tienes para enganche?
  - ¿Banco preferido?
    ↓
Sara calcula capacidad de crédito
    ↓
Notifica al asesor asignado:
  "🏦 *Nuevo lead calificado para crédito*
   [datos del lead]
   💡 Comandos: mensaje/bridge [nombre]"
    ↓
Lead recibe confirmación con datos del asesor
```

**Notas guardadas:**
- `lead.notes.credit_flow_context` - Estado del flujo, datos financieros, asesor_id

---

## BITÁCORA DE ACTIVIDADES

Las actividades de bridge se registran automáticamente en la tabla `lead_activities` para el reporte diario del vendedor.

### Tipos de Actividad de Bridge

**NOTA:** La tabla `lead_activities` tiene un constraint que solo permite: `call`, `visit`, `quote`, `whatsapp`, `email`. Por eso los bridges se guardan como `whatsapp` con notas descriptivas.

| Acción | Tipo en DB | Notas |
|--------|------------|-------|
| Iniciar bridge | `whatsapp` | "Bridge iniciado con [nombre] (6 min)" |
| Mensaje en bridge | `whatsapp` | "Mensaje bridge a/de [nombre]: [texto]" |
| Cerrar bridge | `whatsapp` | "Bridge cerrado con [nombre]" |

### Cómo se registra

```
Vendedor: "bridge Juan"
    ↓
Se registra en lead_activities (type=whatsapp, notes="Bridge iniciado...")
    ↓
Vendedor envía mensaje → Se registra (type=whatsapp)
    ↓
Lead responde → Se registra (cuenta para vendedor)
    ↓
Vendedor: "#cerrar" → Se registra (type=whatsapp, notes="Bridge cerrado...")
```

### Ver actividad del día

El CEO/vendedor puede ver su actividad con el comando `actividad` o `bitácora`:

```
Tu actividad hoy:

Llamadas: 3
  Juan, Maria, Pedro

WhatsApps: 5    ← Incluye bridges

Total: 8 actividades
```

**Nota:** Los bridges aparecen en "WhatsApps" porque se guardan con ese tipo.

---

## ARCHIVOS CLAVE

| Archivo | Propósito |
|---------|-----------|
| `src/handlers/whatsapp.ts` | Handler principal de mensajes |
| `src/services/ceoCommandsService.ts` | Comandos de CEO |
| `src/services/asesorCommandsService.ts` | Comandos de asesor hipotecario |
| `src/services/vendorCommandsService.ts` | Comandos de vendedor (básico) |
| `src/services/bridgeService.ts` | Activar bridge (6 min) |
| `src/services/creditFlowService.ts` | Flujo de crédito hipotecario |
| `src/services/leadMessageService.ts` | Procesamiento de mensajes de leads |
| `src/services/aiConversationService.ts` | Conversación con IA (Claude) |
| `src/index.ts` | CRON jobs incluyendo `verificarBridgesPorExpirar` |

---

## TELÉFONOS DE PRUEBA

| Teléfono | Rol | Nombre |
|----------|-----|--------|
| 5212224558475 | CEO/Asesor | CEO Test / Asesor Crédito Test |
| 5215610016226 | Vendedor | Edson Vendedor |

> **IMPORTANTE**: Solo usar estos 2 teléfonos para pruebas. NO enviar mensajes a otros team_members.

---

## BUGS CONOCIDOS / ARREGLADOS

1. ✅ Error JSON parsing en `ceoCerrarBridge` - Arreglado con try/catch
2. ✅ "Quiero hablar con asesor" no detectado si había pending_response_to - Reordenado para detectar PRIMERO
3. ✅ Lead no recibía link de contacto - Ahora recibe wa.me/ y tel:+
4. ✅ Bridge selection "1" no funcionaba para bridge (solo mensaje) - Agregado `action_type` en `pending_lead_selection`
5. ✅ CEO no podía enviar mensajes en bridge (tratados como comandos) - Agregada verificación de `active_bridge` ANTES de procesar comandos
6. ✅ Mensajes de bridge no simétricos - Ahora ambos ven "💬 *Nombre:*"
7. ✅ Bridge duraba 10 min sin aviso - Ahora 6 min con aviso antes de expirar
8. ✅ Comando `cerrar` podía confundirse con conversación - Cambiado a `#cerrar`
9. ✅ Actividades de bridge no se guardaban - DB constraint solo permite `whatsapp`, cambiado tipo

---

## COMANDOS PROBADOS ✅

### CEO
| Comando | Estado |
|---------|--------|
| `bridge [nombre]` | ✅ Probado |
| `#cerrar` | ✅ Probado |
| `#mas` | ✅ Probado |
| `mensaje [nombre]` | ✅ Probado |
| `actividad` | ✅ Probado |
| `ayuda` | ✅ Probado |
| `reporte` | ✅ Probado |
| `hoy` | ✅ Probado |
| Selección `1`, `2`, `3` | ✅ Probado |

### Asesor Hipotecario
| Comando | Estado |
|---------|--------|
| `ayuda` | ✅ Probado 2026-01-18 |
| `mis leads` | ✅ Probado 2026-01-18 |
| `reporte` | ✅ Probado 2026-01-18 |
| `hoy` | ✅ Probado 2026-01-18 |
| `semana` | ✅ Probado 2026-01-18 |
| `on` / `off` | ✅ Probado 2026-01-18 |
| `status [nombre]` | ✅ Probado 2026-01-18 |
| `docs [nombre]` | ✅ Probado 2026-01-18 |
| `preaprobado [nombre]` | ✅ Probado 2026-01-19 (sync con mortgage_applications OK) |
| `rechazado [nombre] [motivo]` | ✅ Probado 2026-01-19 (sync con mortgage_applications OK) |
| `dile [nombre] que [msg]` | ✅ Probado 2026-01-19 |
| `llamar [nombre]` | ✅ Probado 2026-01-18 |
| `adelante [nombre]` | ✅ Probado 2026-01-18 (sync con mortgage_applications OK) |
| `atras [nombre]` | ✅ Probado 2026-01-18 (sync con mortgage_applications OK) |
| `contactado [nombre]` | ✅ Probado 2026-01-19 (sync con mortgage_applications OK) |

### Vendedor
| Comando | Estado |
|---------|--------|
| `citas` | ✅ Probado 2026-01-19 |
| `leads` / `mis leads` | ✅ Probado 2026-01-19 |
| `hoy` | ✅ Probado 2026-01-19 |
| `ayuda` | ✅ Probado 2026-01-19 |
| `reagendar [nombre] [día] [hora]` | ✅ Probado 2026-01-19 |
| `cancelar cita con [nombre]` | ⏳ En prueba |

### Bugs arreglados en pruebas
10. ✅ JSON parsing en `asesorCommandsService.ts` - algunos leads tenían `notes` como texto plano, agregado `safeParseNotes()` helper
11. ✅ Vendedor no respondía (error `detectCoordinadorCommand is not a function`) - Agregada función stub en vendorCommandsService.ts
12. ✅ Vendedor no respondía (error `detectRouteCommand is not a function`) - Agregada función con detección de comandos básicos
13. ✅ Comando "citas" fallaba (`getCitasHoy is not a function`) - Implementadas funciones en vendorCommandsService.ts
14. ✅ Notificación vendedor fallaba fuera de 24h (error 131047) - Implementado template `reactivar_equipo` + pending_notification

---

## CÓMO PROBAR

1. **Mensaje intermediado:**
   - CEO: `mensaje cumpleañero`
   - CEO escribe mensaje
   - Lead responde
   - CEO recibe respuesta

2. **Bridge (chat directo):**
   - CEO: `bridge cumpleañero`
   - Si hay varios: selecciona `1`
   - CEO manda mensaje → Lead ve "💬 *CEO Test:* mensaje"
   - Lead responde → CEO ve "💬 *Cumpleañero Prueba:* mensaje"
   - Espera ~5 min para ver aviso de expiración
   - `#mas` para extender o `#cerrar` para terminar

3. **Lead pide contacto:**
   - Lead: "quiero hablar con mi asesor"
   - Lead recibe links (wa.me y tel:)
   - Vendedor notificado

---

*Última actualización: 2026-01-19 15:15*

---

## HISTORIAL DE CAMBIOS

### 2026-01-19

**Sesión 3 (14:00-15:15)**
- ✅ Arreglado error `detectCoordinadorCommand is not a function` en vendedor
- ✅ Arreglado error `detectRouteCommand is not a function` en vendedor
- ✅ Implementada detección de comandos básicos de vendedor (citas, leads, hoy, ayuda, reagendar, cancelar)
- ✅ Implementadas funciones `getCitasHoy`, `formatCitasHoy`, `getBriefing`, `formatBriefing`, `getMetaAvance`, `formatMetaAvance`, `getResumenLeads`, `formatResumenLeads` en vendorCommandsService.ts
- ✅ Implementado sistema de notificación vendedor con template cuando está fuera de ventana 24h (error 131047)
- ✅ Agregada lógica de pending_notification para entregar mensaje cuando vendedor responde al template
- 🔧 Teléfono de prueba vendedor: 5215610016226 (Edson Vendedor)

**Sesión 2 (mañana)**
- ✅ Comandos asesor hipotecario completamente probados
- ✅ Sync entre comandos asesor y tabla mortgage_applications

**Sesión 1 (ayer)**
- ✅ Sistema bridge CEO funcionando
- ✅ Sistema mensaje intermediado funcionando
