# SARA CRM - Documentación de Comandos y Flujos

> **IMPORTANTE**: Lee este archivo al inicio de cada sesión para no repetir trabajo.

---

## ANTES DE HACER DEPLOY

```bash
# 1. Correr tests (OBLIGATORIO)
npm test

# 2. Si pasan todos, hacer deploy
npx wrangler deploy

# 3. Verificar logs
npx wrangler tail --format=pretty
```

### Tests Automatizados (211 tests)

| Archivo | Tests | Qué protege |
|---------|-------|-------------|
| `newFeatures.test.ts` | 43 | Notas en CRM, recap condicional, sugerencias IA, regresión comandos |
| `conversationLogic.test.ts` | 35 | GPS solo, recursos completos, bridge |
| `asesorCommands.test.ts` | 32 | Comandos Asesor: leads, docs, preaprobado, rechazado |
| `vendorCommands.test.ts` | 30 | Comandos Vendedor: citas, leads, agendar, brochure |
| `ceoCommands.test.ts` | 27 | Comandos CEO: leads, equipo, ventas, bridge, recursos |
| `vendedorParsers.test.ts` | 22 | Parseo de fechas, horas, días |
| `leadScoring.test.ts` | 11 | Scoring de leads |
| `dateParser.test.ts` | 8 | Parseo de fechas en español |
| `ServiceFactory.test.ts` | 3 | Factory de servicios |

**Si un test falla = NO HACER DEPLOY** hasta arreglarlo.

### Smoke Test (después de deploy)
```bash
./scripts/smoke-test.sh
```

### Checklist de Pruebas Manuales (cuando hay cambios grandes)

**Lead (teléfono: 5215610016226)**
- [ ] Pedir ubicación → recibe SOLO GPS
- [ ] Pedir información → recibe video + brochure + matterport + GPS
- [ ] Agendar cita → cita se crea correctamente
- [ ] Preguntar precio → responde con precio

**CEO (teléfono: 5212224558475)**
- [ ] `leads` → lista leads
- [ ] `hoy` → resumen del día
- [ ] `bridge [nombre]` → activa chat directo
- [ ] Mensaje durante bridge → llega al lead
- [ ] `#cerrar` → cierra bridge

**Vendedor**
- [ ] `citas` → muestra citas del día
- [ ] `bridge [nombre]` → activa chat directo
- [ ] `brochure [desarrollo]` → envía brochure al lead

**Asesor**
- [ ] `leads` → muestra leads asignados
- [ ] `docs [nombre]` → solicita documentos

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
| `adelante [nombre]` | Mover lead al siguiente paso del funnel | `ceoMoverLead` |
| `atras [nombre]` | Regresar lead al paso anterior | `ceoMoverLead` |
| `quien es [nombre]` | Ver info completa del lead | `ceoQuienEs` |
| `brochure [desarrollo/modelo]` | Enviar brochure del desarrollo | `ceoBrochure` |
| `ubicacion [desarrollo/modelo]` | Enviar GPS del desarrollo | `ceoUbicacion` |
| `video [desarrollo/modelo]` | Enviar video del desarrollo | `ceoVideo` |

---

## COMANDOS ASESOR HIPOTECARIO

| Comando | Acción |
|---------|--------|
| `ayuda` | Ver comandos |
| `mis leads` / `leads` | Ver leads asignados |
| `status [nombre]` / `info [nombre]` | Ver detalle de un lead |
| `docs [nombre]` | Pedir documentos al lead |
| `docs pendientes` / `pendientes` | Ver leads esperando documentos |
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
| `brochure [desarrollo/modelo]` | Enviar brochure del desarrollo | `vendedorEnviarBrochure` |
| `ubicacion [desarrollo/modelo]` | Enviar GPS del desarrollo | `vendedorEnviarUbicacion` |
| `video [desarrollo/modelo]` | Enviar video del desarrollo | `vendedorEnviarVideo` |
| `credito [nombre]` | Pasar lead a asesor hipotecario | `vendedorPasarACredito` |
| `nuevo lead [nombre] [tel] [desarrollo]` | Registrar lead directo (se queda con el vendedor) | `vendedorNuevoLead` |
| `hot` / `leads hot` | Ver leads calientes (score >= 70) | `vendedorLeadsHot` |
| `pendientes` | Ver leads pendientes de contactar | `vendedorLeadsPendientes` |
| `coach [nombre]` | Coaching personalizado para un lead | `vendedorCoaching` |
| `quien es [nombre]` / `info [nombre]` | Ver información completa del lead | `vendedorQuienEs` |
| `ver [nombre/teléfono]` | Ver historial de conversación con lead | `vendedorVerHistorial` |
| `mover [nombre] a [etapa]` | Mover lead a otra etapa del funnel | `vendedorMoverEtapa` |
| `nota [nombre] [texto]` | Agregar nota a un lead (aparece en CRM) | `vendedorAgregarNota` |
| `notas [nombre]` | Ver notas guardadas de un lead | `vendedorVerNotas` |
| `bridge [nombre]` | Chat directo con lead (10 min) | `bridgeLead` |
| `#mas` / `#continuar` | Extender bridge 6 min más | `extenderBridge` |
| `#cerrar` / `#fin` | Terminar conexiones activas | `cerrarBridge` |
| `apartar [nombre] en [desarrollo] [enganche]` | Registrar apartado | `vendedorRegistrarApartado` |
| `cerrar venta [nombre]` | Marcar venta como cerrada | `vendedorCerrarVenta` |
| `cancelar [nombre]` | Marcar lead como caído | `vendedorCancelarLead` |
| Números `1`, `2`, `3`, `4` | Responder a opciones pendientes | - |

> **NOTA**: Los comandos brochure/ubicacion/video buscan por nombre de desarrollo (ej: "Monte Verde") O por nombre de modelo (ej: "Acacia", "Fresno").

> **SUGERENCIAS INTELIGENTES**: Si escribes un comando incompleto o no reconocido, SARA usa IA para entender tu intención y sugerirte el comando correcto. Ejemplo: si escribes solo "nota", te responde cómo usarlo correctamente.

### Comando: credito [nombre]
Pasa un lead a un asesor hipotecario:
- `credito Juan` - Pasa el lead Juan al asesor
- `credito a María` - También funciona con "a"
- `hipoteca Pedro` - Alias
- `pasar Juan a credito` - Formato alternativo

### Comando: ver [nombre/teléfono]
Muestra el historial de conversación con un lead:
- `ver Juan` - Busca por nombre
- `ver 4921375548` - Busca por teléfono (con o sin guiones)
- `ver 492-137-5548` - También funciona con guiones

**Muestra:**
- Nombre, teléfono, score, desarrollo de interés
- Últimos 10 mensajes de la conversación
- Quién escribió cada mensaje (Lead o SARA)
- Sugerencia para responder o activar bridge

**Nota:** CEO/Admin pueden ver cualquier lead. Vendedores solo ven sus leads asignados.

### Comando: nuevo lead
Registra un lead que se queda asignado al vendedor (NO entra a round robin):
- `nuevo lead Juan Pérez 5551234567` - Sin desarrollo
- `nuevo lead María López 5559876543 Monte Verde` - Con desarrollo
- `agregar Pedro García 5551112222` - Alias

### Comando: apartar (VentasService)
Registra apartado de propiedad:
- `apartar Juan en Distrito Falco 50000` - Con enganche
- `apartar María en Monte Verde 30000 para el 20 enero` - Con fecha de pago
- Actualiza lead a status `reserved`
- Envía felicitación automática al cliente

### Comando: cerrar venta (VentasService)
Marca una venta como cerrada:
- `cerrar venta Juan García`
- `venta cerrada María`
- Actualiza lead a status `closed_won`

### Comando: cancelar lead (VentasService)
Marca lead como caído:
- `cancelar Juan`
- `lead caído María López`
- `descartar Pedro`
- Actualiza lead a status `fallen`

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
27. ✅ Leads sin vendedor (`assigned_to = NULL`) - Fallbacks + CRON reasignación cada 2 min
28. ✅ `asignarAsesorHipotecario()` era stub - Implementado completo con notificaciones
29. ✅ `MortgageService` vacío - Implementado `finalizeCreditFlow()`, `getCreditsForVendor()`, etc.
30. ✅ Video no enviado si falta desarrollo - Agregado fallback a primer desarrollo con video
31. ✅ DNC no excluido de broadcasts - Excluir `do_not_contact=true` en queries
32. ✅ Comando `ver` fallaba con columna `stage` inexistente - Removida de queries (2026-01-24)
33. ✅ Team members tratados como leads - Prioridad team_member sobre lead (2026-01-24)
34. ✅ Follow-up approval no encontraba leads - Query JSONB cambiada a filtrado en código (2026-01-24)
35. ✅ SARA inventaba citas/horarios - Nueva regla ultra-crítica en prompt de IA (2026-01-24)

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
| `adelante [nombre]` | ✅ Probado 2026-01-20 |
| `atras [nombre]` | ✅ Probado 2026-01-20 |
| `quien es [nombre]` | ✅ Probado 2026-01-20 |
| `brochure [desarrollo/modelo]` | ✅ Probado 2026-01-20 |
| `ubicacion [desarrollo/modelo]` | ✅ Probado 2026-01-20 |
| `video [desarrollo/modelo]` | ✅ Probado 2026-01-20 |
| `equipo` | ✅ Verificado 2026-01-22 (lista team activo) |
| `ventas` | ✅ Implementado 2026-01-22 (métricas reales) |
| `broadcast` | ✅ Verificado 2026-01-22 (muestra ayuda broadcast) |
| `segmentos` | ✅ Verificado 2026-01-22 (lista segmentos) |
| `eventos` | ✅ Verificado 2026-01-22 (lista eventos) |

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
| `agendar cita con [nombre] [día] [hora]` | ✅ Probado 2026-01-19 |
| `reagendar [nombre] [día] [hora]` | ✅ Probado 2026-01-19 (con sync Google Calendar) |
| `cancelar cita con [nombre]` | ✅ Probado 2026-01-19 |
| `brochure [desarrollo/modelo]` | ✅ Probado 2026-01-20 |
| `ubicacion [desarrollo/modelo]` | ✅ Probado 2026-01-20 |
| `video [desarrollo/modelo]` | ✅ Probado 2026-01-20 |
| Selección `1`, `2` en múltiples leads | ✅ Probado 2026-01-19 |
| Responder `1` para notificar lead (reagendar) | ✅ Probado 2026-01-19 |
| `meta` | ✅ Verificado 2026-01-22 (avance meta mensual) |
| `briefing` | ✅ Verificado 2026-01-22 (resumen matutino) |
| `credito [nombre]` | ✅ Verificado 2026-01-22 (pasa lead a asesor) |
| `nuevo lead [nombre] [tel] [desarrollo]` | ✅ Verificado 2026-01-22 (registra lead directo) |
| `bridge [nombre]` | ✅ Verificado 2026-01-22 (chat directo 6 min) |
| `coach [nombre]` | ✅ Implementado 2026-01-22 (coaching personalizado por lead) |
| `ver [nombre/teléfono]` | ✅ Probado 2026-01-24 (historial de conversación) |
| `nota [nombre] [texto]` | ✅ Probado 2026-01-24 (agregar nota a lead) |
| `notas [nombre]` | ✅ Probado 2026-01-24 (ver notas de lead) |

### Bugs arreglados en pruebas
10. ✅ JSON parsing en `asesorCommandsService.ts` - algunos leads tenían `notes` como texto plano, agregado `safeParseNotes()` helper
11. ✅ Vendedor no respondía (error `detectCoordinadorCommand is not a function`) - Agregada función stub en vendorCommandsService.ts
20. ✅ CEO comandos adelante/atras/brochure/ubicacion/video no implementados - Agregados en ceoCommandsService.ts y whatsapp.ts
21. ✅ Búsqueda de leads con acentos (ñ, é) fallaba - Agregada normalización de texto
22. ✅ Leads duplicados causaban error - Agregada lógica para usar primer match
23. ✅ Columna `google_maps_url` no existía - Cambiado a `gps_link`
24. ✅ Columna `video_url` vacía - Agregado fallback a `youtube_link`
25. ✅ Búsqueda solo por desarrollo, no por modelo - Agregada búsqueda por `name` como fallback
26. ✅ Typo "brouchure" no reconocido - Agregado como alias
12. ✅ Vendedor no respondía (error `detectRouteCommand is not a function`) - Agregada función con detección de comandos básicos
13. ✅ Comando "citas" fallaba (`getCitasHoy is not a function`) - Implementadas funciones en vendorCommandsService.ts
14. ✅ Notificación vendedor fallaba fuera de 24h (error 131047) - Implementado template `reactivar_equipo` + pending_notification
15. ✅ Selección "1" en cancelar cita no funcionaba - Agregado manejo de `pending_cita_action` en vendedor handler
16. ✅ Google Calendar creaba duplicados en reagendar - Ahora busca y elimina evento viejo antes de crear nuevo
17. ✅ AM/PM parsing incorrecto ("10 am" → 10pm) - Arreglado `parseReagendarParams` para extraer am/pm correctamente
18. ✅ Notificación al lead no se enviaba tras reagendar - Arreglado `hayReagendarPendiente` con filtro JSON correcto
19. ✅ Timezone incorrecto en Google Calendar - Arreglado para usar America/Mexico_City sin conversión UTC

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

*Última actualización: 2026-01-24 22:15*

---

## AUTOMATIZACIONES OPTIMIZADAS (2026-01-24)

### Cambios realizados para reducir spam

| Antes | Después | Mejora |
|-------|---------|--------|
| 8am: 2 mensajes a CEO (supervisión + reporte) | 8am: 1 mensaje consolidado | -50% mensajes |
| 7pm: 2 mensajes a vendedores (recap + reporte) | 7pm: 1 mensaje consolidado | -50% mensajes |
| Alerta inactividad 11am y 3pm | Alerta inactividad solo 11am | -50% alertas |
| Sin límite de mensajes a leads | Máx 2 mensajes automáticos/día | Anti-spam |

### Límite de mensajes por lead

```
Máximo: 2 mensajes automáticos por día
Excepciones: confirmación de cita, respuesta directa
```

Funciones afectadas:
- `followUp24hLeadsNuevos` - verifica límite antes de enviar
- `reengagementDirectoLeads` - verifica límite antes de enviar
- `nurturingEducativo` - verifica límite antes de enviar

### Cronograma consolidado

| Hora | Destinatario | Mensaje |
|------|--------------|---------|
| 8am L-V | CEO/Admin | Reporte consolidado (resultados + pipeline + alertas) |
| 8am L-V | Vendedores | Briefing matutino (citas + leads) |
| 11am L-V | Admins | Alerta inactividad vendedores |
| 7pm L-V | Vendedores | Reporte consolidado (recap + métricas) |

---

## SISTEMA DE APROBACIÓN DE FOLLOW-UPS (2026-01-24)

### Flujo
```
1. SARA detecta lead sin respuesta (+24h)
2. En vez de enviar directo, notifica al vendedor:

   📤 *FOLLOW-UP PENDIENTE*
   Lead: Juan García
   En 30 min enviaré:
   "¡Hola Juan! 👋 Vi que nos contactaste ayer..."

   • ok juan → enviar ahora
   • cancelar juan → no enviar
   • editar juan [mensaje] → tu versión

3. Si vendedor no responde en 30 min → se envía automático
```

### Comandos del vendedor
| Comando | Acción |
|---------|--------|
| `ok` o `ok juan` | Enviar follow-up inmediatamente |
| `cancelar juan` | No enviar follow-up |
| `editar juan Hola, soy Pedro de Santa Rita...` | Enviar mensaje personalizado |

### Beneficios
- Vendedor tiene control sobre el mensaje
- Puede personalizar o cancelar si ya contactó al lead
- Si está ocupado, SARA lo envía automáticamente

---

## VIDEO PERSONALIZADO DE BIENVENIDA (Veo 3)

### Endpoint
```
GET /test-video-personalizado/{phone}?nombre={nombre}&desarrollo={desarrollo}
```

### Cómo funciona
1. Recibe nombre del lead y desarrollo de interés
2. Selecciona foto de fachada real del desarrollo
3. Detecta género por nombre (termina en 'a' = femenino, excepto excepciones)
4. Genera video con Veo 3: avatar dentro de la propiedad
5. Guarda en `pending_videos` para envío automático
6. CRON verifica cada 2 min y envía cuando está listo

### Fotos de fachada por desarrollo
| Desarrollo | Foto |
|------------|------|
| Monte Verde | EUCALIPTO fachada |
| Los Encinos | Roble fachada |
| Andes | Dalia fachada |
| Miravalle | Fachada desarrollo |
| Distrito Falco | Chipre fachada |
| Acacia | ACACIA fachada |

### Prompt actual
- Avatar (mujer agente) dentro de la propiedad
- Distancia cómoda de cámara (wide shot)
- Sin subtítulos ni texto overlay
- Audio en español: "Hola [nombre], bienvenido/a a ti y a tu familia a tu nuevo hogar aquí en [desarrollo]"

### Límites Veo 3 API
- ~10-20 videos/minuto
- ~100-200 videos/día (con facturación)
- Costo: ~$0.15/segundo (~$1.20 por video de 8 seg)

### Debug endpoints
- `GET /debug-videos` - Ver estado de videos pendientes
- `GET /test-videos` - Forzar procesamiento de videos

### 🔐 Autenticación de API

**Todos los endpoints protegidos requieren API_SECRET:**

```bash
# Opción 1: Header Authorization
curl -H "Authorization: Bearer $API_SECRET" https://sara-backend.edson-633.workers.dev/api/leads

# Opción 2: Query parameter
curl "https://sara-backend.edson-633.workers.dev/api/leads?api_key=$API_SECRET"
```

**Endpoints públicos (sin auth):** `/webhook`, `/health`, `/`

**Configurar secret:**
```bash
# Ver secret actual
npx wrangler secret list

# Cambiar secret
npx wrangler secret put API_SECRET
```

---

## FOLLOW-UPS AUTOMÁTICOS (CRON)

El sistema ejecuta automáticamente estos follow-ups para no perder leads:

### 1. Follow-up 24h Leads Nuevos
- **Horario**: 10am y 4pm L-V
- **Target**: Leads con `status='new'` sin respuesta en 24h
- **Campo de control**: `alerta_enviada_24h` (fecha)
- **Acción**:
  - Envía mensaje amigable al lead (3 variantes aleatorias)
  - Notifica al vendedor asignado
- **Función**: `followUp24hLeadsNuevos()`

### 2. Reminder Documentos Crédito
- **Horario**: 11am L-V
- **Target**: Leads con `credit_status='docs_requested'` por 3+ días
- **Campo de control**: `notes.docs_reminder_sent` (fecha), `notes.ultimo_docs_reminder`
- **Cooldown**: 5 días entre recordatorios
- **Acción**:
  - Envía recordatorio con lista de documentos requeridos
  - Notifica al vendedor
- **Función**: `reminderDocumentosCredito()`

### 3. Video Felicitación Post-Venta (Veo 3)
- **Horario**: 10am diario
- **Target**: Leads con `status='sold'` en últimos 7 días sin video
- **Campo de control**: `notes.video_felicitacion_generado` (fecha)
- **Acción**:
  - Genera video personalizado con Veo 3
  - Avatar felicitando al nuevo propietario dentro de su casa
  - Se guarda en `pending_videos` para envío automático
- **Límite**: Máx 15 videos/día (configurable en `system_config`)
- **Función**: `videoFelicitacionPostVenta()`

### 4. Video de Bienvenida Lead Nuevo (Veo 3)
- **Horario**: Cada 2 horas de 8am-8pm
- **Target**: Leads con `status='new'` creados en últimas 2 horas
- **Campo de control**: `notes.video_bienvenida_enviado` (fecha)
- **Acción**:
  - Genera video personalizado con Veo 3
  - Avatar dando la bienvenida frente a fachada del desarrollo
  - Se guarda en `pending_videos` para envío automático
- **Función**: `videoBienvenidaLeadNuevo()`

### 5. Alertas de Leads Calientes
- **Horario**: En tiempo real (cada mensaje de lead)
- **Target**: Cualquier lead que envíe mensaje con señales de compra
- **Señales detectadas**:
  - **Muy alta**: visita, apartado, urgencia, decisión de compra
  - **Alta**: precio, crédito
  - **Media**: disponibilidad (no alerta)
- **Acción**:
  - Alerta inmediata al vendedor con contexto
  - Guarda historial en `notes.historial_señales_calientes`
- **Cooldown**: 30 minutos entre alertas del mismo lead
- **Funciones**: `detectarSeñalesCalientes()`, `alertarLeadCaliente()`

### 6. Recuperación Abandonos Crédito
- **Horario**: 3pm L-V
- **Target**: Leads con `credit_flow_context` abandonado 7-30 días
- **Campo de control**: `notes.ultimo_intento_recuperacion_credito` (fecha)
- **Cooldown**: 14 días entre intentos
- **Acción**:
  - Mensaje personalizado según etapa donde abandonaron
  - Notifica al vendedor/asesor
- **Límite**: Máx 5 por ejecución
- **Función**: `recuperarAbandonosCredito()`

### Otros Follow-ups Existentes
| Función | Horario | Descripción |
|---------|---------|-------------|
| `followUpLeadsInactivos` | 11am L-V | Leads 3+ días sin responder |
| `reengagementDirectoLeads` | 11am/5pm L-S | Día 3, 7, 14 sin actividad |
| `remarketingLeadsFrios` | Miércoles | Remarketing semanal |
| `felicitarCumpleañosLeads` | 9am diario | Cumpleaños de leads |
| `seguimientoCredito` | 12pm L-V | Leads con crédito estancado |
| `seguimientoPostVenta` | 10am diario | 30, 60, 90 días post-venta |
| `enviarRecapDiario` | 7pm L-V | Recap solo si NO usó SARA hoy |

---

## HISTORIAL DE CAMBIOS

### 2026-01-25

**Sesión 5 (22:45) - Análisis completo y mejoras de código**

- ✅ **Validación firma webhook Meta (opcional):**
  - Código para verificar `X-Hub-Signature-256` en webhooks
  - Si `META_WEBHOOK_SECRET` está configurado → valida firma
  - Si no está → funciona igual (warning en logs)
  - Previene spoofing de mensajes falsos

- ✅ **Regla IA: No inventar tasas de interés:**
  - NUNCA mencionar tasas específicas ("6.5% anual")
  - NUNCA comparar bancos ("BBVA tiene mejor tasa")
  - NUNCA prometer tiempos de aprobación
  - Redirigir al asesor hipotecario para info de tasas

- ✅ **VentasService implementado (13 métodos):**
  - `parseApartado()` / `registrarApartado()` - Registrar apartados
  - `parseCerrarVenta()` / `cerrarVenta()` - Cerrar ventas
  - `parseCancelarLead()` / `cancelarLead()` - Cancelar leads
  - Comandos: `apartar Juan en Falco 50000`, `cerrar venta Juan`, `cancelar María`

- ✅ **Mejora de logging (~140 cambios):**
  - `console.log('⚠️...')` → `console.error('⚠️...')`
  - `console.log('❌...')` → `console.error('❌...')`
  - Errores ahora aparecen con nivel correcto en Cloudflare

- ✅ **Limpieza de código:**
  - 18 archivos backup movidos a `_old_backups/`
  - Agregado `_old_backups/` a `.gitignore`
  - Repo más limpio (-17KB)

**Sesión 4 (22:30) - Seguridad de Endpoints**

- ✅ **Protección de endpoints con API_SECRET:**
  - Todos los endpoints `/api/*`, `/test-*`, `/debug-*` ahora requieren autenticación
  - Usar header `Authorization: Bearer <API_SECRET>` o query param `?api_key=<API_SECRET>`
  - Endpoints públicos (sin auth): `/webhook`, `/health`, `/`
  - Secret almacenado en Cloudflare: `wrangler secret put API_SECRET`

- ✅ **Endpoints críticos protegidos:**
  - `/api/leads` - Ya no expone todos los leads sin auth
  - `/api/team-members` - Ya no expone todo el equipo sin auth
  - `/api/appointments` - Ya no expone todas las citas sin auth
  - +44 endpoints de debug ahora protegidos

### 2026-01-24

**Sesión 3 (21:00) - Fix Follow-up Approval + Anti-Invención Citas**

- ✅ **Sistema de aprobación de follow-ups arreglado:**
  - Fix: Query JSONB de Supabase no funcionaba, cambiado a filtrado en código
  - Fix: Fallbacks para `lead_phone` y `lead_name` cuando son null
  - Fix: Debug info en mensajes para diagnosticar problemas
  - Ahora funciona correctamente: vendedor recibe preview, responde `ok [nombre]`, mensaje llega al lead

- ✅ **Regla ULTRA-CRÍTICA: SARA no inventa citas:**
  - Problema: SARA decía "mañana a las 10 AM" cuando NO había cita
  - Solución: Nueva regla en prompt de IA
  - `"Interés en modelo ≠ cita agendada"`
  - Flujo correcto: info modelo → preguntar si quiere visita → cliente da fecha → crear cita
  - Solo después de crear cita puede mencionar fecha/hora

- ✅ **Nuevos endpoints de debug:**
  - `/debug-followup?phone=X` - Ver pending_followup de un lead
  - `/debug-vendedor?phone=X` - Ver qué vendedor se identifica por teléfono
  - `/debug-aprobar?vendedor_id=X&nombre_lead=X` - Simular handler de aprobar
  - `/debug-citas?phone=X` - Ver citas de un lead + últimos mensajes
  - `/test-contexto?phone=X` - Ver qué info recibe la IA sobre un lead

- ✅ Tests: 211 pasando ✅
- ✅ Deploy exitoso

**Sesión 2 (19:00) - Sugerencias Inteligentes con IA**
- ✅ **Sugerencias inteligentes cuando comando no reconocido:**
  - Antes: Mostraba menú de ayuda genérico
  - Ahora: Claude entiende la intención y sugiere el comando correcto
  - Ejemplo: "nota" → "Para agregar una nota escribe: *nota [nombre] [texto]*"
  - Función: `generateSmartResponse()` en IACoachingService
  - Fallback inteligente si Claude no disponible
  - Logs detallados: `[IA-INTENT]`, `[SMART-RESPONSE]`, `[generateSmartResponse]`

- ✅ **Comandos nota/notas implementados:**
  - `nota [nombre] [texto]` - Agregar nota a un lead
  - `notas [nombre]` - Ver notas de un lead
  - Las notas aparecen en el CRM en "Actividades del vendedor"
  - Se guardan como tipo `whatsapp` con prefijo "📝 NOTA:"
  - Útil para registrar llamadas, visitas, acuerdos

- ✅ **Detección ventana 24h WhatsApp:**
  - Detecta si lead no ha escrito en 24h
  - Muestra opciones: templates o contacto directo
  - Opción 4: muestra teléfono del lead y recuerda registrar nota

- ✅ **Recap 7pm solo si NO usó SARA:**
  - A las 7pm L-V se envía template `reactivar_equipo`
  - Solo a vendedores que NO interactuaron con SARA ese día
  - Cuando responden → reciben mensaje "¿Cómo te fue hoy?"
  - Invita a reportar con comando `nota [nombre] [qué pasó]`
  - Si ya usó SARA → no recibe recap (ya interactuó)

- ✅ Tests: 168 pasando ✅
- ✅ Deploy exitoso

### 2026-01-23

**Sesión 9 (22:55) - Video Veo 3 + Test Real**
- ✅ **Fix prompts de video Veo 3:**
  - Problema: Videos generaban casas/lugares ficticios en vez de usar la fachada real
  - Solución: Agregar instrucción explícita en todos los prompts:
    ```
    IMPORTANT: Use ONLY the exact house facade from the input image.
    Do NOT generate or show any other houses, buildings, or locations.
    ```
  - 5 prompts actualizados:
    - Video personalizado de bienvenida
    - Video de retry para fallidos
    - Video felicitación post-venta (test)
    - Video felicitación post-venta (CRON)
    - Video bienvenida lead nuevo (CRON)
  - Archivo: `src/index.ts` líneas ~4872, 5119, 7070, 18850, 19060

- ✅ **Endpoint `/test-real` para pruebas con envío real:**
  - Envía mensajes REALES a WhatsApp (no solo detecta comandos)
  - Tests disponibles:
    - `?test=mensaje` - Mensaje simple
    - `?test=briefing` - Briefing matutino
    - `?test=reporte` - Reporte diario CEO
    - `?test=alerta` - Alerta lead caliente
    - `?test=comando` - Ejecuta comando ventas
    - `?test=video` - Genera video Veo 3
    - `?test=all` - Ejecuta 3 tests seguidos
  - Archivo: `src/index.ts` línea ~278

- ✅ Tests: 168 pasando ✅
- ✅ Deploy exitoso
- ✅ Probado en WhatsApp: mensajes, alertas, videos llegan correctamente

**Sesión 10 (23:15) - Automatizaciones Vendedor**
- ✅ **4 Automatizaciones Críticas Implementadas:**

  **1. Notificación en tiempo real cuando lead responde** (whatsapp.ts:500-550)
  - Alerta inmediata al vendedor asignado cuando un lead envía mensaje
  - Anti-spam: cooldown 5 min entre notificaciones
  - No notifica respuestas cortas ("ok", "si") ni durante bridge activo
  - Vendedor puede desactivar con `notificaciones_lead_responde: false` en notes

  **2. Alerta cuando lead "se calienta"** (aiConversationService.ts:4193-4220)
  - Notifica al vendedor cuando score sube +20 puntos
  - Muestra: nombre, score anterior → nuevo, temperatura, desarrollo
  - Sugiere comando `info [nombre]` para ver detalles

  **3. Alerta lead sin contactar 10+ min** (index.ts:10312-10375)
  - CRON cada 2 min verifica leads nuevos (10-120 min)
  - Alerta al vendedor si no hay actividad registrada
  - Incluye: "Leads contactados en <5 min tienen 9x más probabilidad de cerrar"
  - Sugiere `bridge [nombre]` para contactar
  - Solo alerta una vez por lead (flag `alerta_sin_contactar_enviada`)

  **4. Pre-No-Show Alert** (index.ts:10843-10902)
  - CRON cada 2 min verifica citas en 2-3 horas
  - Alerta al vendedor si lead NO ha confirmado
  - Sugiere `bridge [nombre]` para confirmar
  - Solo alerta una vez por cita (flag `pre_noshow_alert_sent`)

- ✅ **Resumen: 40+ automatizaciones activas para vendedores**
- ✅ Tests: 168 pasando ✅
- ✅ Deploy exitoso

**Sesión 11 (23:40) - Fixes Completos**
- ✅ **8 Fixes implementados:**

  **1. Rate limiting Veo 3** (index.ts:14853-14880)
  - Máximo 100 videos/día
  - Procesa máximo 3 por CRON (cada 2 min)
  - Evita sobrecargar API de Google

  **2. Round-robin con disponibilidad** (mortgageService.ts:51-90)
  - Verifica vacaciones (notas.en_vacaciones/on_vacation)
  - Verifica horario personalizado (notas.horario_inicio/fin)
  - No asigna leads a asesores de vacaciones

  **3. Registrar abandonos de crédito** (creditFlowService.ts:85-165)
  - Guarda historial en notas.credit_flow_abandonos
  - Registra: fecha, estado, razón, banco, ingreso
  - Crea actividad en lead_activities

  **4. Comando docs pendientes** (asesorCommandsService.ts:148, 875-930)
  - `docs pendientes` / `pendientes` / `esperando docs`
  - Muestra leads esperando documentos
  - Incluye: días esperando, documentos faltantes
  - Colores: 🔴 >3 días, 🟡 >1 día, 🟢 reciente

  **5. Comandos vendedor documentados** (SARA_COMANDOS.md)
  - `hot` / `leads hot` - Ver leads calientes
  - `pendientes` - Leads sin contactar
  - `coach [nombre]` - Coaching personalizado
  - `quien es [nombre]` / `info [nombre]` - Info del lead
  - `mover [nombre] a [etapa]` - Cambiar etapa
  - `bridge [nombre]` - Chat directo

  **6. Limpieza código** (whatsapp.ts:8155-8165)
  - Removido bloque TODO obsoleto
  - Simplificado comentarios de migración

  **7. Notificaciones a vendedor** (ya existente)
  - Sistema pending_notification + template reactivar_equipo
  - Funciona correctamente para ventana 24h

  **8. Broadcast completo** (ya existente)
  - Flujo: `broadcast` → `segmentos` → `enviar a [seg]: [msg]`
  - Cola automática para >15 leads

- ✅ Tests: 168 pasando ✅
- ✅ Deploy exitoso

**Sesión 8 (21:30) - Performance Check**
- ✅ **STUBS IMPLEMENTADOS:**

  **1. `parseAgendarCita()` en asesorCommandsService.ts**
  - Antes: `return null; // TODO`
  - Ahora: Parsea formato completo "cita Juan mañana 10am en oficina"
  - Soporta: hoy/mañana/días de semana/fechas específicas
  - Soporta: horas con am/pm, lugar opcional

  **2. `crearCitaHipoteca()` en asesorCommandsService.ts**
  - Antes: `return { error: 'No implementado' }`
  - Ahora: Crea cita, notifica al lead, actualiza mortgage_application
  - Archivo: líneas 1276-1340

  **3. Round-robin en vendorCommandsService.ts**
  - Antes: `asesores[0]` (siempre el primero)
  - Ahora: Selecciona asesor con menor carga activa
  - Cuenta mortgage_applications en status activos
  - Archivo: línea 319

- ✅ **MÉTRICAS CORREGIDAS (iaCoachingService.ts):**
  - `tiempoPromedioRespuesta`: Antes 0 hardcodeado, ahora calcula desde `first_contacted_at - assigned_at`
  - `mensajesEnviados`: Antes 0 hardcodeado, ahora cuenta `lead_activities` tipo whatsapp

- ✅ **LOOPS PARALELIZADOS (Promise.allSettled):**
  - `enviarReporteDiarioCEO` - Antes secuencial, ahora paralelo
  - `enviarReporteSemanalCEO` - Antes secuencial, ahora paralelo
  - `enviarReporteMensualCEO` - Antes secuencial, ahora paralelo
  - Video semanal a equipo - Antes secuencial, ahora paralelo
  - **Impacto**: Si hay 10 admins y cada mensaje toma 2s: antes 20s, ahora 2s

- ✅ **ERROR HANDLING AGREGADO (whatsapp.ts):**
  - try/catch en update `leads.notes` (línea 1025)
  - try/catch en insert `lead_activities` (línea 1042)

- ✅ Tests: 168 pasando ✅
- ✅ Deploy exitoso

**Sesión 7 (19:00)**
- ✅ **Video semanal sin texto overlay**
  - Antes: Veo 3 intentaba renderizar texto "SEMANA EXITOSA" y stats (salía corrupto)
  - Ahora: Video solo muestra escena de celebración (sin texto)
  - Stats se envían en caption de WhatsApp formateado
- ✅ **Caption mejorado del video semanal:**
  ```
  🎬 *¡RESUMEN SEMANAL!*

  📊 *Resultados del equipo:*
     📥 11 leads nuevos
     📅 2 citas agendadas
     🏆 0 cierres

  🥇 *MVP de la semana:*
     Juan Pérez (3 cierres)

  ¡Vamos por más! 💪🔥
  ```
- ✅ **Cleanup del repositorio:**
  - Agregado `.gitignore` (node_modules, .wrangler, *.png, .DS_Store)
  - Removidos 12,084 archivos innecesarios del repo
- ✅ Archivo: `src/index.ts` líneas ~14862-14913

**Sesión 6 (18:00)**
- ✅ **Flujo no-show mejorado:**
  - Cuando lead responde al mensaje de reagendar → notifica al vendedor
  - Guarda respuesta en CRM y actualiza status a 'contacted'
  - Vendedor recibe: "📱 *[Lead] respondió a tu mensaje de reagendar:* [mensaje]"
- ✅ **Video semanal ahora incluye coordinadores:**
  - Antes: Solo vendedores y admins
  - Ahora: vendedores + admins + coordinadores
- ✅ **Nuevo endpoint `/send-video-to-role`:**
  - Permite enviar video manualmente a roles específicos
  - Útil para pruebas y envíos ad-hoc
- ✅ Archivo: `src/handlers/whatsapp.ts`, `src/index.ts`

### 2026-01-22

**Sesión 5 (23:15)**
- ✅ **Fix 4 gaps críticos del Vendor Journey:**

  **1. Notificación a asesor habilitada**
  - Antes: Comentada/deshabilitada
  - Ahora: Asesor recibe notificación cuando le pasan un lead a crédito
  - Archivo: `src/handlers/whatsapp.ts` línea ~7003

  **2. Round-robin inteligente para asesores**
  - Antes: Siempre `asesores[0]` (el primero)
  - Ahora: Selecciona el asesor con menos carga activa
  - Cuenta mortgage_applications en status: pending, docs_requested, in_review, preapproved
  - Archivo: `src/services/mortgageService.ts` líneas 57-85, 292-315

  **3. Meta mensual configurable**
  - Antes: Hardcoded `const metaMensual = 5`
  - Ahora: 1) `team_member.meta_mensual`, 2) `system_config.meta_mensual_default`, 3) default 5
  - Archivo: `src/handlers/whatsapp.ts` línea ~6773

  **4. Coaching expandido**
  - Antes: `getCoaching()` no existía (error)
  - Ahora: Comando `coach [nombre]` funcional con:
    - Análisis del lead (status, score, días inactivo)
    - Recomendaciones personalizadas por etapa
    - Acciones inmediatas sugeridas
  - Archivo: `src/services/iaCoachingService.ts` líneas 338-430

- ✅ Tests: 168 pasando ✅
- ✅ Deploy exitoso

**Sesión 4 (21:50)**
- ✅ **Capacitación SARA programada para 23-ene 8am**
  - Mensaje automático a todos los vendedores, coordinadores y admins
  - Contenido: Comandos esenciales (citas, leads, hoy, bridge, brochure, ubicacion, agendar, reagendar)
  - One-time task en `src/index.ts` línea ~9830
  - Se ejecutará junto con el briefing matutino
- ✅ **Comando `ventas` implementado** (antes era stub)
  - Muestra ventas este mes vs mes pasado
  - Porcentaje de cambio con tendencia (📈/📉)
  - Tasa de conversión (ventas/leads)
  - Top 5 vendedores con medallas 🥇🥈🥉
  - Archivo: `src/services/ceoCommandsService.ts`
- ✅ **Verificación de comandos faltantes:**
  - CEO: equipo, broadcast, segmentos, eventos ✅
  - Vendedor: meta, briefing, credito, nuevo lead, bridge ✅
- ✅ Tests: 168 pasando ✅
- ✅ Deploy exitoso

**Sesión 3 - Auditoría CRM (18:00)**
- ✅ **Auditoría completa del CRM** - Detectados y corregidos 5 bugs críticos:

**Bug #1: Leads sin vendedor asignado (`assigned_to = NULL`)**
- Problema: 30-40% de leads perdidos por no tener vendedor
- Solución:
  - Fallbacks en `getAvailableVendor()`: coordinadores → admins → cualquier activo
  - CRON cada 2 min para reasignar leads huérfanos
  - Alerta al CEO cuando lead se crea sin vendedor
- Archivo: `src/index.ts`

**Bug #2: `asignarAsesorHipotecario()` era un stub**
- Problema: Comando "asignar asesor [nombre]" no funcionaba
- Solución:
  - Implementación completa: busca lead, valida, asigna asesor, crea mortgage_application
  - Agregados métodos de formato: `formatMensajeAsesorNuevoLead()`, `formatConfirmacionAsesorAsignado()`
  - Implementado `preguntarAsesorCredito()` para consultas de estado
- Archivo: `src/services/vendorCommandsService.ts`

**Bug #3: `MortgageService` vacío**
- Problema: Todo el flujo de crédito hipotecario roto
- Solución: Implementación completa con:
  - `finalizeCreditFlow()` - Asigna asesor al completar flujo
  - `getCreditsForVendor()` - Lista créditos de un vendedor
  - `crearOActualizarConNotificacion()` - Gestión de mortgage_applications
  - `formatMensajeNuevoLead()`, `formatMensajeActualizacion()` - Mensajes para asesor
  - `getCreditDetailByLead()` - Detalle de crédito por lead
- Archivo: `src/services/mortgageService.ts` (de 4 líneas a 479)

**Bug #4: Video no enviado si falta desarrollo**
- Problema: Si lead no especificaba desarrollo, no recibía video
- Solución:
  - CASO 3 fallback: si `todosDesarrollos` vacío, usar primer desarrollo con video
  - Actualiza `property_interest` con desarrollo usado
- Archivo: `src/services/aiConversationService.ts`

**Bug #5: DNC no sincronizado a broadcasts**
- Problema: Leads marcados como "No molestar" seguían recibiendo broadcasts
- Solución:
  - Excluir `do_not_contact=true` en query de `broadcastQueueService.ts`
  - Verificación adicional en loop de envío
  - Excluir DNC en `getLeadsParaEnvio()` de agenciaReportingService.ts
- Archivos: `src/services/broadcastQueueService.ts`, `src/services/agenciaReportingService.ts`

- ✅ Tests: 168 pasando ✅
- ✅ Deploy exitoso

**Sesión 2 (16:30)**
- ✅ **Memoria de Acciones en Historial** - Sara ahora recuerda qué recursos envió
  - Nueva función `guardarAccionEnHistorial()` en aiConversationService.ts
  - Cada envío de video, GPS, brochure se registra en el historial
  - Formato: `[ACCIÓN SARA: Envié video y recorrido 3D - Monte Verde]`
  - Claude puede ver qué recursos se enviaron y responder coherentemente
  - Cuando lead dice "gracias, lo vi" → Sara sabe a qué se refiere
- ✅ **Historial aumentado de 8 a 15 mensajes** para mejor contexto
- ✅ **Contexto de acciones en prompt** - Claude recibe sección "ACCIONES RECIENTES QUE YA HICISTE"
  - Evita reenviar recursos innecesariamente
  - Responde coherentemente cuando lead/vendedor menciona algo enviado
- ✅ Tests: 168 pasando ✅

**Sesión 1 (15:45)**
- ✅ **Fix `secondary_intents: []`** - Agregado a todos los returns en `aiConversationService.ts` que tenían `intent` pero faltaba `secondary_intents`
  - 8 returns corregidos en fallbacks (líneas ~1729, 1744, 1815, 1874, 1953, 1971, 2000, 2022)
  - Garantiza consistencia en respuestas de IA
  - Tests: 168 pasando ✅

### 2026-01-21

**Sesión 4 (18:00-22:00)**
- ✅ **GPS se envía cuando lead lo pide** - `send_gps: true` en respuesta de IA
- ✅ **Si pide SOLO ubicación → manda SOLO el GPS** (no video, brochure, matterport)
- ✅ **GPS inteligente según cita:**
  - Con cita agendada → GPS + "Recuerda que tu cita es el [fecha] a las [hora]"
  - Sin cita → GPS + "¿Te gustaría agendar una visita?"
- ✅ Agregado endpoint `/debug-gps` para ver links en DB
- ✅ Agregado endpoint `/reset-lead-resources` para resetear flag de recursos enviados
- ✅ Fix `detectarYCrearReferido` que causaba error "problema técnico"
- ✅ Bridge para vendedores - reenvío de mensajes durante sesión activa
- ✅ Detección de comandos bridge antes de reenviar (evita mandar "bridge juan" al lead)
- ✅ **Links GPS correctos en Supabase:**
  - Monte Verde: `https://maps.app.goo.gl/Ets7DQucabeuAG8u9`
  - Los Encinos: `https://maps.google.com/?cid=12604230232439364433`
  - Distrito Falco: `https://maps.app.goo.gl/aNu3TML3D2o9HG146`
  - Andes: `https://maps.app.goo.gl/FQ8Hr6AWDgy5sNkT6`
  - Miravalle: `https://maps.app.goo.gl/GAuBaQLu2APRwTmq7`
  - Alpes: `https://maps.app.goo.gl/2MMLYqo85279egR39`
  - Villa Campelo: `https://maps.app.goo.gl/z1BbEgFXeCEbh2BA8`
  - Villa Galiano: `https://maps.google.com/?cid=12461047127110483480`
- ✅ **Tests automatizados** - 168 tests para proteger funcionalidad crítica:
  - CEO: 27 tests (leads, equipo, ventas, bridge, recursos, funnel)
  - Vendedor: 30 tests (citas, leads, agendar, reagendar, brochure, ubicacion)
  - Asesor: 32 tests (leads, docs, preaprobado, rechazado, dile, citas)
  - GPS/Recursos: 35 tests (solo GPS, recursos completos, bridge)
  - Parsers: 22 tests (fechas, horas, días de la semana)
  - Otros: 22 tests (scoring, fechas, service factory)
  - **Ejecutar antes de deploy:** `npm test`
  - Fix bug `ceoCommandsService.ts` línea 107 (`message` → `msgLower`)
- ✅ **Protección contra regresiones:**
  - Git hook pre-commit: bloquea commits si tests fallan
  - Comentarios `CRÍTICO - NO MODIFICAR` en código GPS y Bridge
  - `CLAUDE.md` actualizado con reglas específicas y secciones protegidas
  - Fix regex de "sábado" que no capturaba acento en primera 'a'

**Sesión 3 (13:00-)**
- ✅ Corregido prompt de video post-venta (fachada en lugar de interior, "¡Felicidades!" en lugar de "hogar")
- ✅ Implementado video de bienvenida para leads nuevos con Veo 3
- ✅ Implementada detección de leads calientes en tiempo real
- ✅ Implementada recuperación de abandonos en proceso de crédito
- ✅ **Lead scoring automático** - Score 0-100 basado en:
  - Status (0-30 pts)
  - Interacciones (0-20 pts)
  - Señales calientes (0-25 pts)
  - Recencia (0-15 pts)
  - Preparación crédito (0-10 pts)
  - Engagement (0-10 pts)
  - Categorías: HOT (80+), WARM (60+), LUKEWARM (40+), COLD (20+), FROZEN (<20)
- ✅ **Follow-up post-visita** - Re-engagement para leads que visitaron pero no avanzaron (2-14 días)
- ✅ **Nurturing educativo** - Contenido sobre crédito, compra, enganche y testimoniales
  - 6 piezas de contenido rotativo
  - Martes y Jueves 11am
  - Cooldown 7 días entre envíos
- ✅ **Programa de referidos** - Solicita referidos a clientes 30-90 días post-venta
  - Miércoles 11am
  - Cooldown 60 días
  - Notifica al vendedor
- ✅ **Manejo de objeciones** - Detecta 8 tipos de objeciones en tiempo real:
  - Precio, ubicación, timing, desconfianza, competencia, crédito negado, tamaño, indecisión
  - Alerta al vendedor con respuestas sugeridas
  - Cooldown 2 horas
- ✅ **Encuestas NPS** - Mide satisfacción 0-10:
  - Target: clientes post-visita y post-venta (7-30 días)
  - Viernes 10am
  - Clasifica: Promotor (9-10), Pasivo (7-8), Detractor (0-6)
  - Alerta inmediata si detractor
- ✅ Documentación actualizada de todos los follow-ups

**Sesión 2 (01:00-)**
- ✅ Implementado follow-up 24h para leads nuevos (campo `alerta_enviada_24h`)
- ✅ Implementado reminder documentos crédito (3+ días con `credit_status='docs_requested'`)
- ✅ Implementado video felicitación post-venta automático con Veo 3
- ✅ Documentación de todos los follow-ups automáticos

**Sesión 1 (19:00-00:00)**
- ✅ Video personalizado Veo 3 funcionando con avatar
- ✅ Avatar dentro de la propiedad (no frente a pantalla)
- ✅ Fotos reales de fachadas por desarrollo
- ✅ Detección de género (bienvenido/bienvenida)
- ✅ Sin subtítulos ni texto en video
- ✅ Chat IA agregado a dashboards CEO, Vendedor y Asesor en CRM
- ✅ Probado con lead real (Juan - Acacia)

### 2026-01-20

**Sesión 1 (07:00-08:00)**
- ✅ Implementados comandos CEO: adelante, atras, quien es, brochure, ubicacion, video
- ✅ Implementados comandos Vendedor: brochure, ubicacion, video
- ✅ Arreglada búsqueda de leads con acentos (normalización de texto)
- ✅ Arreglado manejo de leads duplicados
- ✅ Corregidas columnas: `gps_link` (no google_maps_url), `youtube_link` como fallback de video_url
- ✅ Agregada búsqueda por nombre de modelo además de desarrollo
- ✅ Actualizados GPS links de todos los desarrollos en Supabase:
  - Distrito Falco, Andes, Los Encinos, Villa Galiano, Villa Campelo, Alpes, Miravalle, Monte Verde

### 2026-01-19

**Sesión 4 (16:00-18:20)**
- ✅ Arreglado Google Calendar creando duplicados en reagendar - agregado `findEventsByName` en CalendarService
- ✅ Arreglado AM/PM parsing ("10 am" con espacio se interpretaba como PM)
- ✅ Arreglado notificación al lead tras reagendar - `hayReagendarPendiente` ahora usa filtro JSON correcto
- ✅ Arreglado timezone en Google Calendar (usaba UTC, ahora America/Mexico_City)
- ✅ Flujo completo de reagendar probado: comando → selección → confirmación → notificación lead → sync Calendar

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
