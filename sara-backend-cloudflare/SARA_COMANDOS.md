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
| `brochure [desarrollo/modelo]` | Enviar brochure del desarrollo | `vendedorEnviarBrochure` |
| `ubicacion [desarrollo/modelo]` | Enviar GPS del desarrollo | `vendedorEnviarUbicacion` |
| `video [desarrollo/modelo]` | Enviar video del desarrollo | `vendedorEnviarVideo` |
| `credito [nombre]` | Pasar lead a asesor hipotecario | `vendedorPasarACredito` |
| `nuevo lead [nombre] [tel] [desarrollo]` | Registrar lead directo (se queda con el vendedor) | `vendedorNuevoLead` |
| `#mas` / `#continuar` | Extender bridge 6 min más | - |
| `#cerrar` / `#fin` | Terminar conexiones activas | - |
| Números `1`, `2`, `3`, `4` | Responder a opciones pendientes | - |

> **NOTA**: Los comandos brochure/ubicacion/video buscan por nombre de desarrollo (ej: "Monte Verde") O por nombre de modelo (ej: "Acacia", "Fresno").

### Comando: credito [nombre]
Pasa un lead a un asesor hipotecario:
- `credito Juan` - Pasa el lead Juan al asesor
- `credito a María` - También funciona con "a"
- `hipoteca Pedro` - Alias
- `pasar Juan a credito` - Formato alternativo

### Comando: nuevo lead
Registra un lead que se queda asignado al vendedor (NO entra a round robin):
- `nuevo lead Juan Pérez 5551234567` - Sin desarrollo
- `nuevo lead María López 5559876543 Monte Verde` - Con desarrollo
- `agregar Pedro García 5551112222` - Alias

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
| `adelante [nombre]` | ✅ Probado 2026-01-20 |
| `atras [nombre]` | ✅ Probado 2026-01-20 |
| `quien es [nombre]` | ✅ Probado 2026-01-20 |
| `brochure [desarrollo/modelo]` | ✅ Probado 2026-01-20 |
| `ubicacion [desarrollo/modelo]` | ✅ Probado 2026-01-20 |
| `video [desarrollo/modelo]` | ✅ Probado 2026-01-20 |

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

*Última actualización: 2026-01-21 00:00*

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

---

## HISTORIAL DE CAMBIOS

### 2026-01-21

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
