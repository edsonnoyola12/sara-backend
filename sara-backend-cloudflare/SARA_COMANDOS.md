# SARA CRM - Documentación de Comandos y Flujos

> **IMPORTANTE**: Lee este archivo al inicio de cada sesión para no repetir trabajo.

---

## ANTES DE HACER DEPLOY

```bash
# 1. Correr tests (OBLIGATORIO)
npm test

# 2. Si pasan todos, hacer deploy a STAGING primero
npx wrangler deploy --env staging

# 3. Verificar en staging
./scripts/smoke-test.sh https://sara-backend-staging.edson-633.workers.dev $API_SECRET

# 4. Si todo OK, deploy a PRODUCCIÓN
npx wrangler deploy

# 5. Verificar en producción
./scripts/smoke-test.sh https://sara-backend.edson-633.workers.dev $API_SECRET

# 6. Ver logs
npx wrangler tail --format=pretty
```

### Environments

| Environment | URL | Comando Deploy | Crons |
|-------------|-----|----------------|-------|
| **Production** | `sara-backend.edson-633.workers.dev` | `npx wrangler deploy` | ✅ Activos |
| **Staging** | `sara-backend-staging.edson-633.workers.dev` | `npx wrangler deploy --env staging` | ❌ Desactivados |

**Staging sirve para:**
- Probar cambios antes de producción
- Sin crons (no envía mensajes automáticos)
- KV Cache separado
- Mismos secrets que producción

### Tests Automatizados (798 tests)

| Archivo | Tests | Qué protege |
|---------|-------|-------------|
| `aiResponses.test.ts` | 44 | **Validación IA**: nombres inventados, Nogal, alberca, renta, objeciones, inglés, edge cases |
| `newFeatures.test.ts` | 43 | Notas en CRM, recap condicional, sugerencias IA, regresión comandos |
| `integration.test.ts` | 38 | **Flujos end-to-end**: endpoints, auth, webhook, comandos, CORS, cache |
| `conversationLogic.test.ts` | 35 | GPS solo, recursos completos, bridge |
| `asesorCommands.test.ts` | 32 | Comandos Asesor: leads, docs, preaprobado, rechazado |
| `vendorCommands.test.ts` | 30 | Comandos Vendedor: citas, leads, agendar, brochure |
| `ceoCommands.test.ts` | 27 | Comandos CEO: leads, equipo, ventas, bridge, recursos |
| `vendedorParsers.test.ts` | 22 | Parseo de fechas, horas, días |
| `retryService.test.ts` | 11 | Retry logic, exponential backoff, error detection |
| `leadScoring.test.ts` | 11 | Scoring de leads |
| `dateParser.test.ts` | 8 | Parseo de fechas en español |
| `creditFlowService.test.ts` | 69 | Flujo hipotecario: detección, calificación, asignación asesor, cancelación |
| `mortgageService.test.ts` | 25 | Formateo créditos, mensajes lead/asesor, finalización flujo, notificaciones |
| `notificationService.test.ts` | 12 | Notificaciones vendedor/admin, recordatorios citas, encuestas |
| `ServiceFactory.test.ts` | 3 | Factory de servicios |

### Load Tests

```bash
# Test básico (10 VUs, 30 segundos)
node scripts/load-tests/simple-load-test.js

# Con más usuarios y duración
node scripts/load-tests/simple-load-test.js --vus=50 --duration=60

# Contra staging
BASE_URL=https://sara-backend-staging.edson-633.workers.dev API_SECRET=xxx node scripts/load-tests/simple-load-test.js

# Con k6 (más completo)
k6 run scripts/load-tests/k6-load-test.js
```

**Métricas esperadas (producción):**
| Métrica | Valor típico |
|---------|--------------|
| Error rate | < 1% |
| P50 latency | ~400ms |
| P95 latency | ~900ms |
| Requests/sec | ~20-30 |

### Integration Tests (38 tests)

Los integration tests prueban flujos completos end-to-end:

| Categoría | Tests | Qué valida |
|-----------|-------|------------|
| Endpoints Públicos | 3 | `/`, `/health`, OPTIONS/CORS |
| Autenticación | 3 | API key en header y query param |
| Webhook WhatsApp | 4 | Estructura de Meta, verificación token |
| Comandos CEO | 5 | ayuda, leads, hoy, bridge, #cerrar |
| Comandos Vendedor | 5 | citas, brochure, ubicacion, nota, ver |
| Comandos Asesor | 4 | mis leads, docs, preaprobado, rechazado |
| Rate Limiting | 2 | Headers, conteo por IP |
| Flujo Lead | 4 | Info, ubicación, cita, precios |
| Flujo Crédito | 2 | Preguntas de crédito, info financiera |
| Cache KV | 2 | Estadísticas, TTL por tipo |
| CORS | 2 | Whitelist, rechazo de orígenes |
| Estructura Datos | 3 | Campos requeridos de lead, team_member, property |

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

**CEO (teléfono: 5214922019052 - Oscar)**
- [ ] `leads` → lista leads
- [ ] `hoy` → resumen del día
- [ ] `bridge [nombre]` → activa chat directo
- [ ] Mensaje durante bridge → llega al lead
- [ ] `#cerrar` → cierra bridge
- [ ] Comandos de vendedor (citas, briefing, nota, etc.)
- [ ] Comandos de asesor (preaprobado, rechazado, docs, etc.)
- [ ] Comandos de marketing (campañas, metricas, segmentos)

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

### Reportes y Resúmenes
| Comando | Acción |
|---------|--------|
| `ayuda` / `help` / `?` | Ver todos los comandos |
| `hoy` / `resumen` | Resumen del día |
| `reporte` | Resumen semanal de leads |
| `equipo` / `vendedores` | Ver equipo activo |
| `leads` / `clientes` | Estado de todos los leads |
| `ventas` | Métricas de ventas |
| `meta` | Ver meta mensual |
| `pendientes` | Ver leads sin seguimiento |
| `conexiones` / `quien se conectó` | Ver quién del equipo se conectó hoy |
| `actividad` / `bitácora` | Ver actividad del día |

### Leads y Seguimiento
| Comando | Acción |
|---------|--------|
| `mis leads` / `mi cartera` | Ver resumen de leads propios |
| `hot` / `calientes` | Ver leads calientes (score >= 70) |
| `ver [teléfono]` / `historial [teléfono]` | Ver info y conversación de un lead |
| `quien es [nombre]` / `buscar [nombre]` | Buscar lead por nombre |
| `nota [nombre] [texto]` | Agregar nota a un lead |
| `notas [nombre]` | Ver notas de un lead |
| `nuevo lead [nombre] [tel] [desarrollo]` | Crear lead manualmente |

### Comunicación con Leads
| Comando | Acción |
|---------|--------|
| `mensaje [nombre]` | Enviar mensaje a lead (Sara intermedia) |
| `bridge [nombre]` | Chat directo con lead (6 min) |
| `bridge [nombre] "mensaje"` | Bridge con mensaje inicial |
| `#mas` / `#continuar` | Extender bridge 6 min más |
| `#cerrar` / `#fin` | Terminar conexión activa |

### Funnel y Etapas
| Comando | Acción |
|---------|--------|
| `adelante [nombre]` | Mover lead al siguiente paso |
| `atras [nombre]` | Regresar lead al paso anterior |

### Citas
| Comando | Acción |
|---------|--------|
| `citas` / `mis citas` | Ver citas de hoy |
| `citas mañana` | Ver citas de mañana |

### Recursos de Desarrollos
| Comando | Acción |
|---------|--------|
| `brochure [desarrollo]` | Enviar brochure |
| `ubicacion [desarrollo]` | Enviar GPS |
| `video [desarrollo]` | Enviar video |

### Marketing y Broadcasts
| Comando | Acción |
|---------|--------|
| `broadcast` | Enviar mensaje masivo |
| `segmentos` | Ver segmentos disponibles |
| `eventos` | Ver eventos activos |

### Extras
| Comando | Acción |
|---------|--------|
| `coaching` / `tips` | Tips de ventas |

---

## COMANDOS ASESOR HIPOTECARIO

### Leads y Gestión
| Comando | Acción |
|---------|--------|
| `ayuda` | Ver comandos disponibles |
| `mis leads` / `leads` | Ver leads asignados |
| `status [nombre]` / `info [nombre]` | Ver detalle de un lead |
| `llamar [nombre]` | Ver teléfono del lead |
| `llamar ia [nombre]` | SARA llama al lead por teléfono con IA (Retell.ai) |
| `contactado [nombre]` | Marcar como contactado |

### Documentos y Crédito
| Comando | Acción |
|---------|--------|
| `docs [nombre]` | Pedir documentos al lead |
| `docs pendientes` / `pendientes` | Ver leads esperando documentos |
| `preaprobado [nombre]` | Notificar pre-aprobación |
| `rechazado [nombre] [motivo]` | Notificar rechazo + categorizar motivo + guardar `mortgage_recovery` + mensaje personalizado |
| `actualizar [nombre] banco=[banco] monto=[monto]` | Actualizar datos del lead |

### Comunicación
| Comando | Acción |
|---------|--------|
| `dile [nombre] que [mensaje]` | Enviar mensaje vía Sara |
| `bridge [nombre]` | Chat directo con lead (6 min) |
| `bridge [nombre] "mensaje"` | Bridge con mensaje inicial |
| `#mas` / `#continuar` | Extender bridge 6 min más |
| `#cerrar` / `#fin` | Terminar conexión activa |

### Funnel
| Comando | Acción |
|---------|--------|
| `adelante [nombre]` | Mover al siguiente paso |
| `atras [nombre]` | Regresar al paso anterior |

### Citas
| Comando | Acción |
|---------|--------|
| `hoy` / `citas hoy` | Citas de hoy |
| `semana` / `citas semana` | Citas de la semana |
| `agendar [nombre] [fecha] [hora]` | Agendar cita |
| `cancelar cita [nombre]` | Cancelar cita |
| `reagendar [nombre] [fecha] [hora]` | Reagendar cita |

### Otros
| Comando | Acción |
|---------|--------|
| `reporte` | Ver estadísticas |
| `on` / `off` | Activar/pausar disponibilidad |
| `nuevo lead hipoteca [nombre] [tel]` | Crear lead de hipoteca |

---

## COMANDOS VENDEDOR

| Comando | Acción | Handler |
|---------|--------|---------|
| `citas` / `mis citas` | Ver citas de hoy | `vendedorCitasHoy` |
| `citas mañana` / `mis citas mañana` | Ver citas de mañana (📞 llamadas / 📋 citas) | `vendedorCitasManana` |
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
| `contactar [nombre]` / `conectar [nombre]` | Enviar template a lead fuera de 24h (seguimiento/crédito) | `vendedorContactarLead` |
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
| `llamar ia [nombre]` | SARA llama al lead con IA (Retell.ai) | `vendedorLlamarIA` |
| `recordar llamar [nombre] [fecha] [hora]` | Programar llamada a un lead | `vendedorRecordarLlamar` |
| `llamar [nombre] [día] [hora]` | Alias para programar llamada | `vendedorRecordarLlamar` |
| `reagendar llamada [nombre] [nueva fecha/hora]` | Cambiar hora de llamada programada | `vendedorReagendarLlamada` |
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
- Actualiza lead a status `sold`
- Guarda `purchase_date` automáticamente (para flujos post-compra)

### Comando: cancelar lead (VentasService)
Marca lead como caído:
- `cancelar Juan`
- `lead caído María López`
- `descartar Pedro`
- Actualiza lead a status `fallen`

### Comando: llamar ia [nombre] (Retell.ai)
SARA llama al lead por teléfono usando inteligencia artificial:
- `llamar ia Juan` - SARA llama a Juan ahora mismo
- `llamar ia María López` - Llama a María López

**Qué pasa cuando usas este comando:**
1. SARA busca al lead en tu cartera
2. Inicia una llamada telefónica automática desde el número +524923860066
3. SARA (la voz IA) habla con el lead — le pregunta sobre su interés, presupuesto, zona
4. Si el lead quiere agendar cita, SARA la agenda directo en el calendario
5. Al terminar la llamada, te llega un resumen por WhatsApp con lo que pasó

**Llamadas automáticas (CRONs):**
SARA también hace llamadas automáticas sin que tú las pidas:
- **11am L-V:** Seguimiento post-visita (leads que visitaron pero no avanzaron)
- **12pm L-V:** Escalamiento 48h (leads que no contestan WhatsApp en 2 días)
- **1pm L-V:** Post-venta (NPS, satisfacción, referidos)
- **3pm L-V:** Reactivación de leads fríos
- **5pm L-V:** Recordatorio de cita para mañana
- **Cada 30 min:** Si un vendedor tiene mensaje pendiente sin respuesta por 2h → SARA llama

**Llamadas entrantes:**
Si un cliente llama al +524923860066, SARA contesta automáticamente. Reconoce al lead por su teléfono y saluda personalizado.

**Herramientas durante la llamada:**
SARA puede hacer 8 cosas durante la llamada en vivo:
1. Buscar info de desarrollos (precios, amenidades)
2. Buscar por presupuesto
3. Agendar cita (queda en el calendario)
4. Cancelar cita
5. Cambiar cita
6. Enviar info por WhatsApp al lead
7. Consultar crédito hipotecario
8. Consultar citas existentes

### Comando: recordar llamar / llamar
Programa una llamada a un lead:
- `recordar llamar Juan mañana 10am` - Programar para mañana
- `recordar llamar María lunes 3pm` - Programar para día específico
- `llamar Pedro 28/01 4pm` - Formato alternativo con fecha
- Crea appointment con `appointment_type: 'llamada'`
- Te recordará antes de la llamada
- El lead NO recibe notificación (a diferencia de citas presenciales)

### Comando: reagendar llamada
Cambia la hora de una llamada ya programada:
- `reagendar llamada Juan mañana 3pm` - Mover a otro día/hora
- `reagendar llamada María 4pm` - Si solo pones hora, asume hoy
- `cambiar llamada de Pedro lunes 10am` - Formato alternativo
- El lead SÍ recibe notificación del cambio

### Comando: contactar / conectar [nombre]
Envía template de WhatsApp a lead que está fuera de la ventana de 24h:
- `contactar Roberto` - Muestra opciones de template
- `conectar María` - Alias (funciona igual)

**Opciones de template:**
1. **Seguimiento** - Template genérico de seguimiento
2. **Reactivación** - Para leads inactivos
3. **Info crédito** - Para leads interesados en crédito hipotecario

**Flujo de crédito (opción 3):**
- Se envía template `info_credito` al lead
- Cuando el lead responde con fecha/hora → se agenda LLAMADA de crédito
- Se notifica al asesor hipotecario Y al vendedor
- La llamada aparece en el calendario del CRM
- El lead recibe confirmación de la llamada

**Notas:**
- Solo funciona si el lead está fuera de la ventana de 24h de WhatsApp
- Si el lead escribió recientemente, usar `bridge [nombre]` en su lugar

### Notificaciones: Llamadas vs Citas

Las llamadas (tipo `llamada`) y citas presenciales (tipo `visita`) tienen notificaciones diferenciadas:

| Acción | Lead | Vendedor | Asesor | Mensaje Lead |
|--------|------|----------|--------|--------------|
| **Crear** | ✅ | ✅ | ✅ | Confirmación con fecha/hora |
| **Reagendar** | ✅ | ✅ | - | "LLAMADA/CITA ACTUALIZADA" |
| **Cancelar** | ✅ | ✅ | - | "LLAMADA/CITA CANCELADA" |
| **Recordatorio 24h** | ✅ | - | - | "Te recordamos tu llamada/cita mañana..." |
| **Recordatorio 2h** | ✅ | ✅ | - | "Tu llamada/cita es en 2 horas..." |

**Diferencias en mensajes:**
- **Llamadas**: Sin ubicación/GPS, dice "¡Te contactaremos! 📞"
- **Citas**: Con ubicación y GPS, dice "¡Te esperamos! 🏠"

---

## COMANDOS AGENCIA/MARKETING

| Comando | Acción |
|---------|--------|
| `ayuda` | Ver comandos disponibles |
| `campañas` / `campaigns` | Ver campañas activas |
| `metricas` / `stats` | Ver métricas de campañas |
| `leads` | Ver leads de campañas |
| `segmentos` | Ver segmentos disponibles |
| `broadcast` | Enviar mensaje masivo |
| `enviar a [segmento]` | Enviar mensaje a segmento específico |

---

## COMANDOS COORDINADOR

Los coordinadores tienen acceso a los mismos comandos que los vendedores, más la capacidad de ver leads de su equipo.

### Panel CRM Coordinador

El panel de coordinador en el CRM permite:

| Funcionalidad | Descripción |
|---------------|-------------|
| **Crear Lead** | Formulario con nombre, teléfono, fuente, desarrollo, vendedor |
| **Ver Disponibilidad** | Grid de horarios del equipo (9:00-18:00) |
| **Agendar Citas** | Click en horario verde para agendar |
| **Gestionar Citas** | Ver, cambiar, cancelar citas próximas |
| **Reasignar Leads** | Cambiar vendedor asignado |
| **Agregar Notas** | Notas rápidas a leads recientes |

### Endpoints API Coordinador

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/leads` | POST | Crear lead |
| `/api/leads` | GET | Listar leads |
| `/api/appointments` | GET | Listar citas |
| `/api/appointments` | POST | Crear cita |
| `/api/appointments/notify-change` | POST | Notificar cambio/cancelación |
| `/api/team-members` | GET | Listar equipo |
| `/api/properties` | GET | Listar propiedades |

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
| `src/services/outgoingWebhooksService.ts` | Webhooks salientes a sistemas externos |
| `src/services/sentimentAnalysisService.ts` | Análisis de sentimiento de mensajes |
| `src/services/whatsappTemplatesService.ts` | Gestión de templates de WhatsApp |
| `src/services/teamDashboardService.ts` | Dashboard y métricas del equipo |
| `src/services/leadDeduplicationService.ts` | Detección y fusión de leads duplicados |
| `src/services/linkTrackingService.ts` | Rastreo de clicks en enlaces |
| `src/services/slaMonitoringService.ts` | Monitoreo SLA de tiempos de respuesta |
| `src/services/autoAssignmentService.ts` | Motor de reglas de asignación automática |
| `src/services/leadAttributionService.ts` | Atribución de leads con UTM |
| `src/index.ts` | CRON jobs incluyendo `verificarBridgesPorExpirar` |

---

## TELÉFONOS DEL EQUIPO (ACTUALIZADOS)

| Teléfono | Rol | Nombre | Acceso |
|----------|-----|--------|--------|
| **5214922019052** | CEO/Admin | Oscar Castelo | TODOS los comandos |
| 5212224558475 | Vendedor Test | Vendedor Test | Solo vendedor |
| 5214929272839 | Asesor | Leticia Lara | Solo asesor (inactiva) |
| 5210000000001 | Asesor Test | Asesor Crédito Test | Solo asesor (inactivo) |

### Oscar (CEO) tiene acceso a TODOS los comandos

El CEO tiene fallback a todos los roles. Orden de prioridad:
1. **CEO** → equipo, ventas, leads, adelante/atrás, broadcast
2. **Asesor** → preaprobado, rechazado, contactado, docs
3. **Vendedor** → citas, mis leads, hot, briefing, nota, bridge
4. **Marketing** → campañas, metricas, segmentos, broadcast

> **IMPORTANTE**: Para pruebas usar el teléfono del CEO o Vendedor Test.

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
| **📊 REPORTES** | |
| `reporte` / `reporte semanal` / `reporte mensual` | ✅ Probado 2026-01-29 |
| `equipo` | ✅ Probado 2026-01-29 (lista team activo) |
| `conexiones` | ✅ Probado 2026-01-29 (actividad del día) |
| `leads` | ✅ Probado 2026-01-29 (estado de leads) |
| `ventas` | ✅ Probado 2026-01-29 (métricas ventas) |
| `pipeline` | ✅ Probado 2026-01-29 (pipeline completo) |
| `hoy` | ✅ Probado 2026-01-29 (resumen del día) |
| **📈 ANÁLISIS** | |
| `probabilidad` | ✅ Probado 2026-01-29 (probabilidades cierre) |
| `visitas` | ✅ Probado 2026-01-29 (gestión visitas) |
| `ofertas` | ✅ Probado 2026-01-29 (tracking ofertas) |
| `alertas` | ✅ Probado 2026-01-29 (alertas inteligentes) |
| `mercado` | ✅ Probado 2026-01-29 (inteligencia mercado) |
| `clv` | ✅ Probado 2026-01-29 (valor cliente) |
| `programa referidos` | ✅ Probado 2026-03-01 (programa referidos: stats, tiers bronce/plata/oro/diamante) |
| `llamadas` / `calls` | ✅ Agregado 2026-03-01 (dashboard llamadas IA: totales, outcomes, sentimiento, conversión, top vendedores) |
| **🏦 FINANCIAMIENTO** | |
| `calcular [precio]` | ✅ Probado 2026-01-29 (calculadora) |
| `bancos` | ✅ Probado 2026-01-29 (tasas actuales) |
| `comparar [A] vs [B]` | ✅ Probado 2026-01-29 (comparar desarrollos) |
| **💬 COMUNICACIÓN** | |
| `bridge [nombre]` | ✅ Probado 2026-01-29 |
| `#cerrar` / `#mas` | ✅ Probado 2026-01-29 |
| `mensaje [nombre]` | ✅ Probado 2026-01-29 |
| **🔄 GESTIÓN LEADS** | |
| `adelante [nombre]` | ✅ Probado 2026-01-29 |
| `atrás [nombre]` | ✅ Probado 2026-01-29 |
| `quien es [nombre]` | ✅ Probado 2026-01-29 |
| `nota [nombre]: [texto]` | ✅ Probado 2026-01-29 |
| `notas [nombre]` | ✅ Probado 2026-01-29 |
| `historial [nombre]` | ✅ Probado 2026-01-29 |
| `nuevo lead [nombre] [tel] [desarrollo]` | ✅ Probado 2026-01-29 |
| **💰 OFERTAS** | |
| `cotizar [nombre] [precio]` | ✅ Probado 2026-01-29 |
| `enviar oferta [nombre]` | ✅ Probado 2026-01-29 |
| **🏠 RECURSOS** | |
| `brochure [desarrollo]` | ✅ Probado 2026-01-29 |
| `ubicación [desarrollo]` | ✅ Probado 2026-01-29 |
| `video [desarrollo]` | ✅ Probado 2026-01-29 |
| **📡 BROADCASTS** | |
| `broadcast` | ✅ Probado 2026-01-29 |
| `segmentos` | ✅ Probado 2026-01-29 |
| **🎯 EVENTOS** | |
| `eventos` | ✅ Probado 2026-01-29 |
| **🤖 OTROS** | |
| `ayuda` | ✅ Probado 2026-01-29 |
| `mis leads` / `hot` / `pendientes` | ✅ Probado 2026-01-29 |
| `meta` | ✅ Probado 2026-01-29 |
| `coaching [nombre]` | ✅ Probado 2026-01-29 |

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
| `rechazado [nombre] [motivo]` | ✅ Probado 2026-01-19 (sync + mortgage_recovery + categorización + mensaje personalizado) |
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
| `cotizar [nombre] [precio]` | ✅ Probado 2026-01-29 (crear oferta, soporta nombres multi-palabra) |
| `ofertas` / `mis ofertas` | ✅ Probado 2026-01-29 (ver ofertas activas) |
| `oferta [nombre]` | ✅ Probado 2026-01-29 (detalle de oferta de lead) |
| `enviar oferta [nombre]` | ✅ Probado 2026-01-29 (enviar cotización al cliente) |
| `oferta aceptada [nombre]` | ✅ Probado 2026-01-29 (marcar aceptada) |
| `oferta rechazada [nombre] [razón]` | ✅ Probado 2026-01-29 (marcar rechazada) |
| `hot` | ✅ Probado 2026-01-29 (leads calientes) |
| `pendientes` | ✅ Probado 2026-01-29 (leads sin seguimiento) |
| `adelante [nombre]` | ✅ Probado 2026-01-29 (avanzar en funnel) |
| `atrás [nombre]` | ✅ Probado 2026-01-29 (retroceder en funnel) |
| `llamar [nombre]` | ✅ Probado 2026-01-29 (ver teléfono del lead) |
| `recordar llamar [nombre] [fecha]` | ✅ Probado 2026-01-29 (programar llamada) |
| `contactar [nombre]` | ✅ Probado 2026-01-29 (enviar template fuera de 24h) |
| `perdido [nombre]` | ✅ Probado 2026-01-29 (marcar lead como perdido) |
| `asignar asesor [nombre]` | ✅ Probado 2026-01-29 (asignar asesor hipotecario) |
| `cerrar venta [nombre] [propiedad]` | ✅ Probado 2026-01-29 (registrar venta) |
| `apartado [nombre] [propiedad]` | ✅ Probado 2026-01-29 (registrar apartado) |
| `quién es [nombre]` | ✅ Probado 2026-01-29 (info del lead) |
| `historial [nombre]` | ✅ Probado 2026-01-29 (ver conversación) |
| `#cerrar` | ✅ Probado 2026-01-29 (terminar bridge) |
| `#mas` | ✅ Probado 2026-01-29 (extender bridge 6 min) |

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

*Última actualización: 2026-01-29 (refactoring modular + 5 nuevos servicios de inteligencia)*

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

### Briefing Inteligente (8am)

El briefing matutino usa **envío inteligente** según la ventana de 24h de WhatsApp:

| Situación | Qué pasa |
|-----------|----------|
| **Ventana 24h abierta** (interactuó con SARA ayer) | 📋 Recibe briefing DIRECTO |
| **Ventana 24h cerrada** (no ha interactuado) | 📤 Recibe template `seguimiento_lead` → cuando responde → recibe briefing |

**Flujo técnico:**
```
1. Verificar last_sara_interaction del vendedor
2. Si interactuó en últimas 24h:
   → meta.sendWhatsAppMessage(briefing)
3. Si NO interactuó:
   → Guardar briefing en pending_briefing
   → meta.sendTemplate('reactivar_equipo')
   → Cuando responde → entregar pending_briefing
```

**Template usado:** `reactivar_equipo` (APPROVED)

**Mensaje que reciben los que NO tienen ventana 24h:**
```
👋 ¡Hola Oscar!

Soy SARA, tu asistente de Grupo Santa Rita. 🏠

Responde cualquier mensaje para activar nuestra conversación
y poder enviarte reportes, alertas y notificaciones.

Escribe *ayuda* para ver comandos disponibles. 💪
```

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

### Endpoints de Prueba (QA)
| Endpoint | Uso |
|----------|-----|
| `/test-ai-response?msg=X&api_key=Y` | Prueba respuestas de SARA (solo texto, no envía WhatsApp) |
| `/test-lead?phone=X&name=Y&msg=Z&api_key=W` | Flujo completo como lead real (SÍ envía WhatsApp) |
| `/test-vendedor-msg?phone=X&msg=Y&api_key=Z` | Simula mensaje de vendedor/CEO |
| `/test-interactive-responses?api_key=X` | Verifica extracción de list_reply/button_reply (QA) |
| `/test-update-dates?api_key=X` | Actualiza fechas de lead para probar CRONs post-compra |
| `/debug-lead?phone=X` | Debug de un lead específico |
| `/debug-citas?phone=X` | Ver citas de un lead |
| `/debug-vendedor?phone=X` | Debug de un vendedor |
| `/test-ventana-24h` | Ver estado ventana 24h de cada team member (PÚBLICO) |
| `/test-envio-7pm` | Dry-run del reporte 7 PM (PÚBLICO) |
| `/test-envio-7pm?enviar=true` | Envío REAL del reporte 7 PM |
| `/test-envio-7pm?enviar=true&phone=XXXX` | Envío REAL a vendedor específico |
| `/test-pending-flow?phone=X&nombre=Y` | Prueba flujo completo de pending messages (template + pending) |

### Endpoints Post-Compra (Manuales)
| Endpoint | Uso |
|----------|-----|
| `/run-post-entrega` | Ejecuta seguimiento post-entrega (3-7 días) |
| `/run-satisfaccion-casa` | Ejecuta encuesta satisfacción (3-6 meses) |
| `/run-mantenimiento` | Ejecuta check-in mantenimiento (~1 año) |
| `/run-referidos` | Ejecuta solicitud de referidos (30-90 días) |
| `/run-nps` | Ejecuta encuestas NPS (7-30 días) |

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

## NUEVOS ENDPOINTS API (2026-01-25)

### Análisis de Sentimiento
```bash
# Analizar un mensaje
POST /api/sentiment
{
  "message": "¡Excelente! Me encanta la casa, quiero agendar visita YA"
}
# Response: { sentiment: "urgent", score: 0.85, urgency: true, enthusiasm: true }

# Analizar conversación completa
POST /api/sentiment/analyze
{
  "messages": [
    { "role": "user", "content": "Hola, me interesa Monte Verde" },
    { "role": "assistant", "content": "¡Hola! Con gusto te ayudo" },
    { "role": "user", "content": "¿Cuánto cuesta?" }
  ]
}
# Response: { overall: "positive", trend: "stable", avgScore: 0.6 }
```

### Webhooks Salientes
```bash
# Listar webhooks
GET /api/webhooks

# Crear webhook
POST /api/webhooks
{
  "name": "Zapier Lead Nuevo",
  "url": "https://hooks.zapier.com/...",
  "events": ["lead.created", "lead.qualified"],
  "secret": "mi_secret_opcional"
}

# Eliminar webhook
DELETE /api/webhooks/{id}

# Ver entregas fallidas
GET /api/webhooks/failed

# Probar webhook
POST /api/webhooks/test?id={webhook_id}
```

### Templates WhatsApp
```bash
# Listar templates
GET /api/templates

# Solo aprobados
GET /api/templates/approved

# Sincronizar desde Meta
POST /api/templates/sync

# Enviar template
POST /api/templates/send
{
  "to": "5215512345678",
  "templateName": "confirmacion_cita",
  "bodyParams": ["Juan", "25 de enero", "10:00 AM", "Monte Verde"]
}

# Estadísticas de uso
GET /api/templates/stats

# Buscar por tag
GET /api/templates/tag/followup
```

### Manejo de Respuestas a Templates

Cuando SARA envía un template, guarda contexto para manejar respuestas:

| Template | Dónde guarda contexto | Handler |
|----------|----------------------|---------|
| `appointment_confirmation` | `leads.notes.template_sent` | Detecta "sí/confirmo" vs "no/cambiar" |
| `info_credito` | `leads.notes.template_sent` | Agenda llamada con asesor si muestra interés |
| `reagendar_noshow` | `leads.notes.pending_noshow_response` | Notifica vendedor, responde al lead |
| `promo_desarrollo` | `leads.notes.last_broadcast` | Pasa `broadcastContext` a SARA |
| `recordatorio_cita_*` | Consulta BD | SARA ve citas pendientes automáticamente |
| `feliz_cumple` | `leads.notes.pending_birthday_response` | Captura fecha de cumpleaños |
| `referidos_postventa` | Detección regex | Crea lead referido si detecta "referido [nombre] [tel]" |
| `encuesta_*` | `surveys` table | Sistema de encuestas procesa calificaciones |

**Flujo de broadcast/promoción:**
```
1. promo_desarrollo enviado → se guarda last_broadcast en notes
2. Lead responde → checkBroadcastResponse() detecta
3. broadcastContext se pasa a SARA con mensaje original
4. SARA responde CON CONTEXTO de la promoción
```

**Flujo de no-show:**
```
1. Vendedor responde "2" a ¿LLEGÓ? → handler detecta pending_show_confirmation
2. Cita marcada como no_show
3. Lead recibe mensaje de reagendar
4. pending_noshow_response guardado en lead
5. Cuando lead responde → vendedor notificado
```

### Dashboard de Equipo
```bash
# Resumen del equipo
GET /api/team
GET /api/team?period=2026-01

# Métricas de todos los vendedores
GET /api/team/vendors

# Leaderboard
GET /api/team/leaderboard?metric=conversions&limit=10
# Métricas: conversions, revenue, response_time, score

# Métricas de un vendedor
GET /api/team/vendor/{vendor_id}

# Comparar vendedores
GET /api/team/compare?vendor1=abc&vendor2=xyz

# Registrar evento
POST /api/team/event
{
  "vendorId": "abc123",
  "event": "conversion",  // lead_assigned, lead_contacted, lead_qualified, conversion, lead_lost, message, appointment
  "saleValue": 500000,
  "daysToConvert": 15
}
```

### Deduplicación de Leads
```bash
# Verificar si un lead es duplicado
POST /api/leads/deduplicate/check
{
  "lead": { "id": "new", "phone": "5215512345678", "name": "Juan" },
  "existingLeads": [...]
}

# Encontrar todos los duplicados
POST /api/leads/deduplicate/find
{
  "leads": [...]
}

# Estadísticas de duplicados
POST /api/leads/deduplicate/stats
{
  "leads": [...]
}

# Fusionar dos leads
POST /api/leads/deduplicate/merge
{
  "primary": { "id": "lead1", ... },
  "secondary": { "id": "lead2", ... }
}

# Generar SQL para fusionar
POST /api/leads/deduplicate/sql
{
  "primaryId": "lead1",
  "secondaryId": "lead2"
}
```

### Link Tracking
```bash
# Resumen general
GET /api/tracking

# Listar enlaces
GET /api/tracking/links

# Crear enlace rastreable
POST /api/tracking/links
{
  "url": "https://gruposantarita.com/monte-verde",
  "leadId": "lead123",
  "campaignId": "promo-enero",
  "campaignName": "Promoción Enero",
  "tags": ["promo", "monte-verde"],
  "expiresInDays": 30
}
# Response: { trackingUrl: "https://sara.gruposantarita.com/t/abc123XY" }

# Estadísticas de un enlace
GET /api/tracking/links/{id}/stats

# Enlaces de un lead
GET /api/tracking/lead/{lead_id}

# Estadísticas de campaña
GET /api/tracking/campaign/{campaign_id}

# Redirect (público, sin auth)
GET /t/{shortCode}
# Registra click y redirige a URL original
```

### SLA Monitoring
```bash
# Obtener configuración SLA
GET /api/sla

# Actualizar configuración
PUT /api/sla
{
  "firstResponseTime": 5,    // minutos para primer contacto
  "followUpTime": 15,        // minutos para responder
  "escalationTime": 30,      // minutos para escalar
  "alertChannels": ["whatsapp"],
  "escalationContacts": ["supervisor_id"],
  "active": true
}

# Ver respuestas pendientes (leads esperando)
GET /api/sla/pending

# Ver violaciones de SLA
GET /api/sla/violations
GET /api/sla/violations?vendorId=xxx&status=open

# Métricas SLA
GET /api/sla/metrics
GET /api/sla/metrics?from=2026-01-01&to=2026-01-31

# Registrar mensaje entrante (inicia tracking)
POST /api/sla/track
{
  "leadId": "lead123",
  "leadPhone": "5215512345678",
  "vendorId": "vendor123",
  "isFirstMessage": true
}

# Registrar respuesta del vendedor
POST /api/sla/resolve
{
  "leadId": "lead123",
  "vendorId": "vendor123"
}
# Response: { withinSLA: true, responseMinutes: 3.5, slaLimit: 5 }
```

### Auto-Assignment Rules
```bash
# Listar reglas
GET /api/assignment/rules

# Crear regla
POST /api/assignment/rules
{
  "name": "Monte Verde a Juan",
  "priority": 10,
  "conditions": [
    { "type": "development", "operator": "equals", "value": "monte verde" }
  ],
  "conditionLogic": "AND",
  "assignTo": {
    "type": "specific",
    "vendorIds": ["vendor_juan"]
  },
  "active": true
}

# Ejemplos de condiciones:
# - Por desarrollo: { "type": "development", "operator": "contains", "value": "monte" }
# - Por idioma: { "type": "language", "operator": "equals", "value": "english" }
# - Por score: { "type": "score", "operator": "greater_than", "value": 70 }
# - Por fuente: { "type": "source", "operator": "in", "value": ["facebook", "instagram"] }

# Tipos de asignación:
# - specific: a vendedor(es) específico(s)
# - pool: round robin entre grupo de vendedores
# - round_robin: round robin entre todos
# - least_workload: al de menor carga de trabajo

# Actualizar regla
PUT /api/assignment/rules/{id}

# Eliminar regla
DELETE /api/assignment/rules/{id}

# Asignar lead usando reglas
POST /api/assignment/assign
{
  "lead": {
    "phone": "5215512345678",
    "development": "Monte Verde",
    "source": "facebook"
  },
  "vendors": [
    { "id": "v1", "name": "Juan", "phone": "...", "active": true, "currentActiveLeads": 5 },
    { "id": "v2", "name": "María", "phone": "...", "active": true, "currentActiveLeads": 3 }
  ]
}
# Response: { vendorId: "v2", vendorName: "María", ruleName: "Menor carga", reason: "..." }

# Estadísticas de uso de reglas
GET /api/assignment/stats
```

### Lead Attribution (UTM)
```bash
# Resumen de atribución (últimos 30 días)
GET /api/attribution
GET /api/attribution?from=2026-01-01&to=2026-01-31

# Registrar atribución de lead
POST /api/attribution/track
{
  "leadId": "lead123",
  "leadPhone": "5215512345678",
  "leadName": "Juan García",
  "utm_source": "facebook",
  "utm_medium": "cpc",
  "utm_campaign": "promo_enero_2026",
  "utm_content": "video_testimonial",
  "landing_page": "/monte-verde"
}

# Registrar conversión
POST /api/attribution/conversion
{
  "leadId": "lead123",
  "value": 500000  // valor de la venta
}

# Obtener atribución de un lead
GET /api/attribution/lead/{leadId}

# Registrar gasto en publicidad
POST /api/attribution/spend
{
  "source": "facebook",
  "campaign": "promo_enero_2026",
  "date": "2026-01-25",
  "amount": 5000,
  "currency": "MXN"
}

# Ver gastos
GET /api/attribution/spend
GET /api/attribution/spend?source=facebook&from=2026-01-01

# Mejor canal de conversión
GET /api/attribution/best-channel
# Response: { channel: "facebook", conversionRate: 15 }
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

### 7. Recuperación Hipotecas Rechazadas
- **Horario**: 10am L/Mi/Vi
- **Target**: Leads con `status='rejected'` y `notes.mortgage_recovery` existente
- **Campos de control**: `mortgage_recovery.alternatives_sent`, `mortgage_recovery.recovery_step`
- **Día 7**: Envía alternativas personalizadas por categoría de rechazo (buró, ingresos, docs, deuda)
- **Día 30**: Notifica reintento elegible + alerta a asesor/vendedor
- **Límite**: Máx 5 por ejecución
- **Función**: `recuperacionHipotecasRechazadas()`

### 8. Alerta Churn Crítico
- **Horario**: Cada 2h pares (8-20), L-S
- **Target**: Leads con `notes.churn_risk.label` = `critical` o `at_risk`
- **Campo de control**: `notes.churn_alert_sent` (cooldown 48h)
- **Acción**: Notifica vendedor "LEAD EN RIESGO" con razones específicas
- **Límite**: Máx 5 alertas por ejecución
- **Función**: `alertarChurnCritico()`

### 9. Intent Tagging & Buyer Readiness (automático)
- **Trigger**: Cada mensaje de lead procesado por IA
- **Acción**: Persiste `analysis.intent` en `notes.intent_history[]` (máx 20 entradas)
- **Cálculo**: `computeBuyerReadiness(intentHistory)` → `notes.buyer_readiness` (0-100 + label)
- **Labels**: `ready_to_buy ≥70`, `evaluating ≥40`, `browsing ≥15`, `cold <15`
- **Efecto**: Boost en lead scoring (+3 engagement si ≥40, +1 si ≥15)

### 10. Churn Risk (automático en lead scoring)
- **Trigger**: CRON lead scoring cada 2h
- **Cálculo**: `computeChurnRisk(lead, notas)` → `notes.churn_risk` (0-100 + label + reasons)
- **Señales**: Inactividad (40pts), sentimiento negativo (15pts), re-engagement agotado (20pts), buyer readiness bajo (10pts), objeciones (10pts)
- **Labels**: `safe <26`, `cooling 26-50`, `at_risk 51-75`, `critical ≥76`
- **Escalación**: Si churn=critical en paso3 re-engagement → notifica vendedor antes de marcar frío

### Otros Follow-ups Existentes
| Función | Horario | Descripción |
|---------|---------|-------------|
| `followUpLeadsInactivos` | 11am L-V | Leads 3+ días sin responder |
| `reengagementDirectoLeads` | 11am/5pm L-S | Día 3, 7, 14 sin actividad + escalación churn |
| `remarketingLeadsFrios` | Miércoles | Remarketing semanal |
| `felicitarCumpleañosLeads` | 9am diario | Cumpleaños de leads |
| `seguimientoCredito` | 12pm L-V | Leads con crédito estancado |
| `seguimientoPostVenta` | 10am diario | 30, 60, 90 días post-venta |
| `enviarRecapDiario` | 7pm L-V | Recap solo si NO usó SARA hoy |
| `recuperacionHipotecasRechazadas` | 10am L/Mi/Vi | Recovery hipotecas rechazadas |
| `alertarChurnCritico` | Cada 2h L-S | Leads en riesgo de pérdida |

---

## REGLA DE 24 HORAS DE WHATSAPP (CRÍTICO)

### El problema
WhatsApp Business API tiene una restricción: **solo puedes enviar mensajes libres si el usuario escribió en las últimas 24 horas**. Si la ventana está cerrada, el mensaje **NO LLEGA**.

### Cómo lo manejamos
Usamos el campo `last_sara_interaction` en `team_members.notes` para rastrear cuándo fue la última interacción.

**Función helper: `enviarMensajeTeamMember()`**
```typescript
// Uso:
await enviarMensajeTeamMember(supabase, meta, teamMember, mensaje, {
  tipoMensaje: 'reporte_diario',
  guardarPending: true,
  pendingKey: 'pending_reporte_diario'
});
```

### Flujo automático
```
1. SARA quiere enviar mensaje a team member
2. Verifica last_sara_interaction
3. Si < 24h → envía mensaje DIRECTO ✅
4. Si > 24h → envía template + guarda en pending_*
5. Team member responde al template
6. whatsapp.ts detecta pending_* y envía mensaje completo
```

### Templates disponibles para equipo
| Template | Uso |
|----------|-----|
| `reactivar_equipo` | Reactivar ventana 24h con equipo interno |

### Pending keys soportados
| Key | Se entrega cuando... |
|-----|---------------------|
| `pending_briefing` | Responden después de briefing 8 AM |
| `pending_recap` | Responden después de recap 7 PM |
| `pending_reporte_diario` | Responden después de reporte diario |
| `pending_reporte_semanal` | Responden después de reporte semanal |

### Aplica a
- ✅ Vendedores
- ✅ Coordinadores
- ✅ Asesores hipotecarios
- ✅ Marketing/Agencia
- ✅ CEO/Admin

---

## HISTORIAL DE CAMBIOS

### 2026-01-29

**Refactoring Masivo - Modularización de index.ts**

El archivo `index.ts` fue refactorizado de ~22,700 líneas a ~14,300 líneas (-37%) extrayendo funciones CRON a módulos separados en `src/crons/`:

| Fase | Módulo | Líneas | Funciones |
|------|--------|--------|-----------|
| 1 | `reports.ts` | ~400 | Reportes diarios/semanales/mensuales |
| 2 | `briefings.ts` | ~500 | Briefings matutinos, logEvento |
| 2 | `alerts.ts` | ~2470 | Alertas leads fríos/calientes, cumpleaños, churn crítico |
| 3 | `followups.ts` | ~3500 | Follow-ups, nurturing, broadcasts, recovery hipotecas |
| 4 | `leadScoring.ts` | ~800 | Scoring, señales calientes, objeciones, buyer readiness, churn risk |
| 4 | `nurturing.ts` | ~1860 | Recuperación crédito, NPS, referidos, post-compra, cleanup flags |
| 5 | `maintenance.ts` | ~340 | Bridges, leads estancados, aniversarios |
| 6 | `videos.ts` | ~710 | Videos Veo 3 personalizados |
| 7 | `dashboard.ts` | ~700 | Status, analytics, health, backup |

**Total extraído:** ~5,150 líneas en 9 módulos

**Beneficios:**
- Código más mantenible y organizado
- Imports claros entre módulos
- Más fácil de testear y debuggear
- 304 tests siguen pasando ✅

**Nuevos Servicios de Inteligencia de Negocio:**

| Servicio | Función | Comandos CEO | API |
|----------|---------|--------------|-----|
| `pipelineService.ts` | Pipeline ventas + forecast | `pipeline`, `funnel`, `embudo` | `/api/pipeline/*` |
| `financingCalculatorService.ts` | Calculadora hipotecaria | `calcular [precio]`, `bancos`, `tasas` | `/api/financing/*` |
| `propertyComparatorService.ts` | Comparador propiedades | `comparar [A] vs [B]` | `/api/compare/*` |
| `closeProbabilityService.ts` | Probabilidad cierre | `probabilidad`, `pronostico` | `/api/probability/*` |
| `visitManagementService.ts` | Gestión visitas | `visitas`, `recorridos` | `/api/visits/*` |

**Nuevos Endpoints API:**

```
# Pipeline
GET /api/pipeline              - Resumen completo del pipeline
GET /api/pipeline/stages       - Desglose por etapa
GET /api/pipeline/at-risk      - Leads en riesgo
GET /api/pipeline/forecast     - Pronóstico mensual
GET /api/pipeline/whatsapp     - Formato WhatsApp

# Financiamiento
POST /api/financing/calculate  - Calcular para un banco
POST /api/financing/compare    - Comparar todos los bancos
GET /api/financing/quick       - Estimado rápido
GET /api/financing/banks       - Lista de bancos
POST /api/financing/qualify    - Verificar calificación

# Comparador
POST /api/compare              - Comparar por IDs
POST /api/compare/developments - Comparar por desarrollo
GET /api/compare/search        - Buscar propiedades
GET /api/compare/quick         - Comparación rápida texto

# Probabilidad
GET /api/probability           - Todas las probabilidades
GET /api/probability/lead/:id  - Probabilidad de un lead
GET /api/probability/high      - Leads alta probabilidad
GET /api/probability/at-risk   - Leads en riesgo

# Visitas
GET /api/visits                - Resumen de visitas
GET /api/visits/today          - Visitas de hoy
GET /api/visits/tomorrow       - Visitas de mañana
GET /api/visits/week           - Visitas de la semana
POST /api/visits/:id/status    - Actualizar estado
```

---

### 2026-01-28

**QA Exhaustivo + CEO All Commands**

- ✅ **CEO (Oscar) ahora tiene acceso a TODOS los comandos:**
  - Fallback 1: Comandos de Asesor (preaprobado, rechazado, contactado, docs)
  - Fallback 2: Comandos de Vendedor (citas, briefing, nota, hot, bridge)
  - Fallback 3: Comandos de Marketing (campañas, metricas, segmentos, broadcast)
  - Archivos modificados: `src/handlers/whatsapp.ts` (handleCEOMessage)

- ✅ **Endpoint `/test-ai-response` (UNIFICADO 2026-01-31):**
  - Prueba respuestas de SARA sin enviar WhatsApp
  - **IMPORTANTE**: Usa el MISMO `AIConversationService` que los leads reales
  - Todas las correcciones de IA se aplican automáticamente
  - Uso: `/test-ai-response?msg=X&api_key=Y`

- ✅ **Fix: Query de properties sin filtro `active`:**
  - La tabla `properties` NO tiene columna `active`
  - Removido `.eq('active', true)` de queries
  - Todas las 36 propiedades ahora visibles para SARA

- ✅ **QA completado (21 pruebas de IA):**
  - Preguntas de desarrollos: Monte Verde, Distrito Falco, Los Encinos, etc.
  - Citadella del Nogal = Villa Campelo + Villa Galiano
  - NO inventa información (dice "no tengo esa info")
  - Maneja objeciones de precio
  - Errores ortográficos entendidos

- ✅ **Recursos enviados correctamente:**
  - GPS cuando piden ubicación (`send_gps: true`)
  - Brochure PDF cuando piden folleto (`send_brochure: true`)
  - Video cuando piden ver el desarrollo (`send_video_desarrollo: true`)

- ✅ **Flujos verificados:**
  - Agendar citas (detecta fecha, hora, desarrollo)
  - Crédito hipotecario (menciona bancos: BBVA, Banorte, Santander, HSBC)
  - Promoción automática en funnel (new → scheduled)

- ✅ Tests: 260 pasando ✅

**Fix Ventana 24h WhatsApp (CRÍTICO)**

- ✅ **Nueva función `enviarMensajeTeamMember()`:**
  - Verifica si el team member tiene ventana 24h abierta (via `last_sara_interaction`)
  - Si SÍ → envía mensaje DIRECTO
  - Si NO → envía template `reactivar_equipo` + guarda mensaje como PENDING
  - Cuando responden → se entrega el mensaje pendiente automáticamente
  - Archivo: `src/index.ts`

- ✅ **Funciones actualizadas para respetar ventana 24h:**
  - `enviarReporteDiarioVendedores` (7 PM L-V)
  - `enviarReporteDiarioAsesores` (7 PM L-V)
  - `enviarReporteSemanalAsesores` (Lunes 9 AM)

- ✅ **Soporte para pending messages en whatsapp.ts:**
  - `pending_reporte_diario` → se entrega cuando responden
  - `pending_reporte_semanal` → se entrega cuando responden
  - Archivo: `src/handlers/whatsapp.ts`

- ✅ **Flujo ejemplo:**
  ```
  1. 7 PM → SARA intenta enviar reporte a vendedor
  2. Vendedor NO usó SARA hoy (ventana cerrada)
  3. SARA envía template + guarda reporte en pending
  4. Vendedor responde al template
  5. SARA detecta pending y envía reporte completo
  ```

- ✅ **Nuevos endpoints de diagnóstico (PÚBLICOS):**
  - `/test-ventana-24h` - Ver estado de ventana de cada team member
  - `/test-envio-7pm` - Dry-run del reporte 7 PM
  - `/test-envio-7pm?enviar=true` - Envío real
  - `/test-envio-7pm?enviar=true&phone=XXXX` - Envío a uno específico

- ✅ **Pruebas exitosas:**
  | Vendedor | Ventana | Método | Resultado |
  |----------|---------|--------|-----------|
  | Francisco de la Torre | ✅ ABIERTA | DIRECTO | ✅ Llegó |
  | Karla Muedano | ❌ CERRADA | TEMPLATE + PENDING | ✅ Template enviado |

---

### 2026-01-27

**Sesión 1 (16:00) - Dashboard Data Setup + Scoring Fix**

- ✅ **Nuevo endpoint `/test-real?test=setup-dashboard`:**
  - Configura datos realistas para el Dashboard del CRM
  - Crea meta mensual de empresa (5 casas/mes)
  - Crea metas por vendedor en `vendor_monthly_goals`
  - Actualiza leads existentes con presupuestos realistas
  - Crea leads de prueba con diferentes estados (new, contacted, negotiation, reserved, closed)
  - Limpia datos ficticios de `properties` (sold_units = 0)

- ✅ **Validación de team members como leads:**
  - Archivo: `src/services/leadManagementService.ts`
  - Antes de crear un lead, verifica si el teléfono pertenece a un team member
  - Si es team member, retorna `{ lead: null, isTeamMember: true }` sin crear lead
  - Evita que mensajes de prueba del equipo creen leads falsos

- ✅ **Fix scoring en CRM (Frontend):**
  - Archivo: `sara-crm-new/src/App.tsx`
  - Labels: HOT >= 70, WARM >= 40, COLD < 40 (antes era >= 8, >= 5)
  - Contadores de filtros corregidos para usar los mismos umbrales
  - Deploy automático vía Vercel

- ✅ **Pruebas reales ejecutadas:**
  - Health check: ✅ Supabase conectado
  - Webhook WhatsApp: ✅ Procesa mensajes
  - Comandos CEO/Vendedor: ✅ Todos funcionan
  - CRM Web: ✅ https://sara-crm-new.vercel.app
  - Creación de leads: ✅ Se guardan en DB

- ✅ **Datos del Dashboard configurados:**
  | Métrica | Valor |
  |---------|-------|
  | Meta empresa | 5 casas/mes |
  | Leads | 7 |
  | Pipeline | $18.2M |
  | Cerrados | 1 |
  | En negociación | 2 |
  | Reservado | 1 |

- ✅ Tests: 260 pasando ✅
- ✅ Deploy backend: Cloudflare Workers
- ✅ Deploy frontend: Vercel (automático)

---

### 2026-01-26

**Sesión 1 (21:30) - Comandos de Llamada para Vendedor**

- ✅ **Nuevo comando `recordar llamar [nombre] [fecha] [hora]`:**
  - Permite al vendedor programar una llamada a un lead
  - Crea appointment con `appointment_type: 'llamada'`
  - Parsea fechas en español: "mañana", "lunes", "28/01"
  - Sugerencias de leads similares si no encuentra el nombre
  - Handler: `vendedorRecordarLlamar` en whatsapp.ts

- ✅ **Nuevo comando `reagendar llamada [nombre] [nueva fecha/hora]`:**
  - Cambia hora de llamada ya programada
  - Si solo se da hora ("3pm"), asume hoy
  - Notifica al lead del cambio (sin GPS)
  - Handler: `vendedorReagendarLlamada` en whatsapp.ts

- ✅ **Mejora en detección de tipo de cita:**
  - Lead pregunta por "llamada" → busca solo citas tipo llamada
  - Lead pregunta por "cita/visita" → busca solo citas presenciales
  - Si no hay del tipo pedido pero hay del otro, informa al lead
  - Archivos: `aiConversationService.ts`, `leadMessageService.ts`

- ✅ **CORS mejorado para CRM:**
  - Agregado soporte para `sara-crm-new.vercel.app`
  - Soporte dinámico para subdominios de Vercel
  - Endpoints CRM públicos para el frontend

- ✅ **AppointmentService mejorado:**
  - Nuevos params: `skipDuplicateCheck`, `skipVendorNotification`
  - Evita duplicados y notificaciones redundantes

- ✅ Tests: 260 pasando ✅

---

### 2026-01-25

**Sesión 9 (18:00) - Cita de Llamada (Callback Tracking)**

- ✅ **Sistema de citas de llamada (`appointment_type: 'llamada'`):**
  - Detecta cuando lead pide callback: "márcame", "llámame", "contáctame"
  - Distingue de visitas: "quiero visitar" → cita de visita, "márcame" → cita de llamada
  - Crea appointment en DB con `appointment_type: 'llamada'`
  - Duración: 15 min (vs 60 min de visitas)

- ✅ **Notificación al vendedor SIN GPS:**
  - Mensaje: "📞 LLAMADA PROGRAMADA" + nombre + teléfono + fecha + hora
  - NO incluye ubicación/GPS (porque es llamada, no visita)
  - Archivo: `src/services/appointmentService.ts` → `crearCitaLlamada()`

- ✅ **Follow-up automático post-llamada:**
  - Se programa 30 min después de la hora de la llamada
  - Pregunta al vendedor: "¿Se completó la llamada con [nombre]?"
  - Incluye teléfono para re-contactar si no se pudo

- ✅ **Registro en historial:**
  - Actividad: `callback_scheduled`
  - Acción SARA: "Cita de llamada programada - [fecha] a las [hora]"

- ✅ Tests: 260 pasando ✅
- ✅ Deploy exitoso

**Sesión 8 (13:40) - 3 Funcionalidades Críticas para Ventas**

- ✅ **SLA Monitoring (`/api/sla`)**
  - Monitorea tiempo de respuesta de vendedores
  - Alerta cuando se excede límite (default: 5 min primer contacto, 15 min follow-up)
  - Escalamiento automático a supervisores después de 30 min
  - Métricas de cumplimiento SLA por vendedor
  - Configurable por horario de aplicación
  - Archivo: `src/services/slaMonitoringService.ts`

- ✅ **Auto-Assignment Rules (`/api/assignment`)**
  - Motor de reglas para asignar leads automáticamente
  - Condiciones: desarrollo, horario, carga de trabajo, idioma, fuente, score
  - Tipos de asignación: específico, pool, round robin, menor carga
  - Prioridades configurables entre reglas
  - Estadísticas de uso por regla
  - Archivo: `src/services/autoAssignmentService.ts`

- ✅ **Lead Attribution UTM (`/api/attribution`)**
  - Rastrea origen de leads con parámetros UTM
  - Fuentes: Facebook, Google, TikTok, Instagram, orgánico, directo
  - Estadísticas por canal, campaña y landing page
  - Registro de gasto en publicidad
  - Calcula costo por lead (CPL) y ROAS
  - Archivo: `src/services/leadAttributionService.ts`

- ✅ Tests: 260 pasando ✅
- ✅ Deploy exitoso

**Sesión 7 (13:15) - 6 Nuevas Funcionalidades**

- ✅ **Webhooks Salientes (`/api/webhooks`)**
  - Envío automático de eventos a sistemas externos (Zapier, Make, CRMs)
  - Eventos: `lead.created`, `lead.qualified`, `appointment.scheduled`, `sale.completed`, etc.
  - Reintentos automáticos con exponential backoff (1s, 5s, 30s)
  - Firma HMAC-SHA256 para seguridad
  - Cola de entregas fallidas con retry manual
  - Archivo: `src/services/outgoingWebhooksService.ts`

- ✅ **Análisis de Sentimiento (`/api/sentiment`)**
  - Detecta mood del lead: positivo, negativo, neutral, urgente
  - Analiza palabras, emojis, frases en español e inglés
  - Detecta frustración (múltiples ?, MAYÚSCULAS) y entusiasmo (!!!)
  - Genera alertas automáticas según prioridad
  - Score de -1 a 1 con nivel de confianza
  - Archivo: `src/services/sentimentAnalysisService.ts`

- ✅ **Templates WhatsApp (`/api/templates`)**
  - Sincronización con Meta API
  - Gestión de templates aprobados/pendientes/rechazados
  - Envío con variables dinámicas (nombre, fecha, propiedad)
  - Soporte para media en header (imagen, video, documento)
  - Estadísticas de uso por template
  - Archivo: `src/services/whatsappTemplatesService.ts`

- ✅ **Dashboard de Equipo (`/api/team`)**
  - Métricas por vendedor: conversiones, tiempo respuesta, citas, mensajes
  - Leaderboard configurable por métrica (conversiones, revenue, score)
  - Comparativas entre vendedores
  - Alertas de vendedores que necesitan atención
  - Performance score 0-100 calculado automáticamente
  - Archivo: `src/services/teamDashboardService.ts`

- ✅ **Deduplicación de Leads (`/api/leads/deduplicate`)**
  - Detecta duplicados por teléfono (90% confianza), email (85%), nombre (50-70%)
  - Score de confianza para cada match
  - Acción sugerida: merge, review, ignore
  - Fusión de datos con preservación de historial
  - Genera SQL para fusionar en Supabase
  - Archivo: `src/services/leadDeduplicationService.ts`

- ✅ **Link Tracking (`/api/tracking` y `/t/:code`)**
  - Crea URLs rastreables para medir engagement
  - Registra clicks con metadata (dispositivo, browser, IP)
  - Estadísticas por enlace y por campaña
  - Seguimiento por lead individual
  - Redirect automático con `/t/:shortCode`
  - Archivo: `src/services/linkTrackingService.ts`

- ✅ Tests: 260 pasando ✅
- ✅ Deploy exitoso

**Sesión 6 (09:00) - Infraestructura Enterprise**

- ✅ **KV Cache para reducir carga de DB:**
  - `CacheService` nuevo en `src/services/cacheService.ts`
  - Cache de `team_members` (TTL: 5 min)
  - Cache de `properties` (TTL: 10 min)
  - Endpoint `/debug-cache` para monitoreo
  - Si KV no disponible → fallback a DB (fail-safe)

- ✅ **Quick Wins de Seguridad:**
  - **CORS Whitelist**: Solo dominios autorizados (sara-crm.vercel.app, gruposantarita.com, localhost)
  - **Rate Limiting**: 100 req/min por IP usando KV
  - **Structured Logging**: JSON con timestamp, level, requestId, path, ip
  - **Root endpoint**: `/` devuelve info del sistema
  - **Smoke Tests**: `./scripts/smoke-test.sh` (7 tests automáticos)

- ✅ **Staging Environment:**
  - URL: `https://sara-backend-staging.edson-633.workers.dev`
  - Deploy: `npx wrangler deploy --env staging`
  - KV namespace separado (no comparte cache con producción)
  - Sin CRONs (evita mensajes automáticos en staging)
  - Script setup: `./scripts/setup-staging.sh`

- ⏸️ **CI/CD con GitHub Actions:**
  - Workflow creado pero pendiente de token con scope `workflow`
  - Archivo: `.github/workflows/ci-cd.yml` (en repo root)

- ✅ **Retry Logic con Exponential Backoff:**
  - `RetryService` nuevo en `src/services/retryService.ts`
  - Reintentos automáticos para errores de red y 5xx
  - Exponential backoff con jitter (evita thundering herd)
  - Integrado en: MetaWhatsAppService, ClaudeService, CalendarService
  - 11 tests nuevos
  - Configuración por servicio:
    | Servicio | Max Retries | Base Delay | Max Delay |
    |----------|-------------|------------|-----------|
    | Supabase | 3 | 500ms | 5s |
    | Anthropic | 3 | 2s | 15s |
    | Meta | 3 | 1s | 10s |
    | Google | 3 | 1s | 8s |
    | Veo | 2 | 3s | 20s |

- ✅ **Integration Tests (38 tests nuevos):**
  - Tests end-to-end para flujos completos
  - Endpoints públicos, autenticación, webhook WhatsApp
  - Comandos CEO, Vendedor, Asesor
  - Rate limiting, CORS, Cache KV
  - Flujos de Lead y Crédito
  - **Total: 304 tests**

- ✅ **Load Tests:**
  - Scripts en `scripts/load-tests/`
  - `simple-load-test.js` - Node.js nativo, sin dependencias
  - `k6-load-test.js` - Script profesional con escenarios
  - Métricas: latency P50/P90/P95/P99, RPS, error rate
  - Thresholds: error < 5%, P95 < 500ms, RPS > 10
  - **Resultados producción (10 VUs):** 0% errores, 20.5 req/s, P50=401ms

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

---

## ✅ CHECKLIST COMPLETO DE FUNCIONALIDADES (2026-01-29)

### 🔗 CONEXIONES E INTEGRACIONES

| Integración | Estado | Descripción |
|-------------|--------|-------------|
| Meta WhatsApp API | ✅ | Webhook `/webhook/meta` (token: `sara_verify_token`) |
| Facebook Lead Ads | ✅ | Webhook `/webhook/facebook-leads` (token: `sara_fb_leads_token`) |
| Supabase (PostgreSQL) | ✅ | Base de datos principal |
| Cloudflare Workers | ✅ | Runtime de producción |
| Cloudflare KV Cache | ✅ | Cache optimizado |
| Google Calendar | ✅ | Citas y eventos |
| Google Veo 3 | ✅ | Videos personalizados |
| Claude (Anthropic) | ✅ | IA conversacional |

### 🤖 IA CONVERSACIONAL (SARA)

| Funcionalidad | Estado |
|---------------|--------|
| Responder preguntas de desarrollos | ✅ |
| Información de 36 propiedades | ✅ |
| Precios y disponibilidad | ✅ |
| Manejo de objeciones | ✅ |
| Detectar errores ortográficos | ✅ |
| NO inventar información | ✅ |
| Detectar intención de cita | ✅ |
| Detectar interés en crédito | ✅ |
| Envío automático de GPS | ✅ |
| Envío automático de brochure | ✅ |
| Envío automático de video | ✅ |
| **Cierre directo de citas** | ✅ |
| **Rescate de objeciones** | ✅ |

#### 🎯 Comportamiento de Ventas (Actualizado 2026-01-29)

SARA actúa como **VENDEDORA EXPERTA**, no como asistente pasiva:

**✅ CORRECTO (lo que SARA hace ahora):**
| Situación | Respuesta |
|-----------|-----------|
| "quiero ver las casas" | "¿Te funciona el sábado o el domingo?" |
| "me interesa" | "¡Perfecto! ¿Sábado o domingo para visitarlo?" |
| "no me interesa" | "¿Qué te hizo dudar? ¿Precio/ubicación/tamaño?" |
| "lo voy a pensar" | Ofrece valor + pregunta de seguimiento |
| Lead dice objeción | Presenta alternativas específicas |
| "ya compré en otro lado" | "¡Felicidades! 🎉 Si algún familiar busca casa..." |

**🚫 PROHIBIDO (frases que SARA ya NO usa):**
- "Sin problema" / "Entendido" / "Ok"
- "Le aviso a [vendedor] para que te contacte"
- "Aquí estoy si cambias de opinión"
- Respuestas largas sin pregunta de cierre

**Archivos que controlan este comportamiento:**
- `aiConversationService.ts` - Reglas del prompt + corrección post-Claude
- `leadMessageService.ts` - Respuestas a ofertas/cotizaciones

### 📱 COMANDOS WHATSAPP (Verificados 2026-01-29)

**CEO:** leads, briefing, equipo, ventas, pipeline, probabilidad, visitas, alertas, mercado, clv, programa referidos, calcular, bancos, comparar, bridge, broadcast, adelante/atrás, nota, ofertas, brochure/ubicación/video ✅

**Vendedor:** citas, mis leads, hot, pendientes, meta, agendar/reagendar/cancelar cita, nota, notas, bridge, cotizar, ofertas, brochure/ubicación/video, crédito, llamar, coaching ✅

**Asesor:** mis leads, docs, preaprobado, rechazado, contactado, status, reporte ✅

**Marketing:** campañas, metricas, segmentos, broadcast, enviar a [segmento] ✅

### 🖥️ PANELES CRM

| Panel | Estado | Funcionalidades |
|-------|--------|-----------------|
| Vendedor | ✅ | Leads, citas, pipeline, notas |
| Coordinador | ✅ | Crear leads, asignar, reasignar, citas |
| Marketing | ✅ | Dashboard KPIs, funnel, ROI, CPL, PDF |
| CEO/Admin | ✅ | Todo + métricas equipo |

### 📊 APIs (Todas verificadas)

| Categoría | Endpoints |
|-----------|-----------|
| Core | `/health`, `/api/leads`, `/api/team-members`, `/api/appointments`, `/api/properties` |
| Inteligencia | `/api/pipeline/*`, `/api/probability/*`, `/api/visits/*`, `/api/offers/*`, `/api/alerts/*` |
| Finanzas | `/api/financing/*`, `/api/compare/*` |
| Marketing | `/api/attribution/*`, `/api/tracking/*`, `/api/market/*`, `/api/clv/*` |
| Referidos | `/api/referrals`, `/api/referrals/stats` |
| Reportes | `/api/reports/*` |

### ⏰ CRONs AUTOMATIZADOS

| CRON | Frecuencia | Estado |
|------|------------|--------|
| Leads sin asignar | Cada 2 min | ✅ |
| Follow-ups | 2 PM L-V | ✅ |
| Briefing matutino | 8 AM | ✅ |
| Reporte 7 PM | 7 PM | ✅ |
| Alertas/Cumpleaños | Diario | ✅ |
| Scoring leads + churn risk | Cada 2h (8-20) | ✅ |
| Alerta churn crítico | Cada 2h L-S (8-20) | ✅ |
| Recovery hipotecas rechazadas | L/Mi/Vi 10am | ✅ |
| NPS/Encuestas | Viernes 10am | ✅ |
| Seguimiento post-entrega | Lun/Jue 10am | ✅ |
| Satisfacción casa | Martes 11am | ✅ |
| Check-in mantenimiento | Sábado 10am | ✅ |
| Referidos | Miércoles 11am | ✅ |
| Limpieza flags encuestas expirados | Diario 7PM | ✅ |

### 🏠 FLUJOS POST-COMPRA

```
delivered → 3-7 días: 🔑 Seguimiento entrega (llaves, escrituras, servicios)
         → 30-90 días: 🤝 Referidos
         → 3-6 meses: 🏡 Satisfacción casa (1-4)
         → 7-30 días: 📊 NPS (0-10)
         → ~1 año: 🔧 Mantenimiento
         → Cada año: 🎉 Aniversario
```

**Endpoints manuales:**
- `/run-post-entrega` - Seguimiento post-entrega
- `/run-satisfaccion-casa` - Encuesta satisfacción
- `/run-mantenimiento` - Check-in mantenimiento
- `/run-referidos` - Solicitud de referidos
- `/run-nps` - Encuestas NPS

**Protecciones de robustez (Sesión 44):**
- Mark-before-send: flag actualizado ANTES de enviar (previene duplicados por CRON race condition)
- Wamid tracking: captura ID del mensaje para verificar delivery
- Audit trail: `surveys_sent` en notes del lead (rolling últimos 10)
- TTL 48h: flags auto-limpian si lead no responde en 48h
- `isLikelySurveyResponse()`: filtra mensajes largos o con palabras de agenda/propiedad
- Regex estrictos: NPS solo `/^\s*(\d{1,2})\s*$/`, satisfacción `/^\s*([1-4])\s*$/`
- Vendor notifications via `enviarMensajeTeamMember()` (respeta ventana 24h)
- Auto-cleanup CRON: `limpiarFlagsEncuestasExpirados()` limpia flags >72h diario 7PM

### 🔒 FLUJOS DE NEGOCIO

| Flujo | Estado |
|-------|--------|
| Lead → CRM → Vendedor (notificación automática) | ✅ |
| Ventana 24h WhatsApp (templates si cerrada) | ✅ |
| Bridge chat directo (6 min, #cerrar, #mas) | ✅ |
| Crédito hipotecario (calificación + asesor) | ✅ |
| Videos Veo 3 personalizados | ✅ |
| Ofertas/Cotizaciones ciclo completo | ✅ |
| Funnel de ventas (new → delivered) | ✅ |
| **Post-compra: Seguimiento entrega** | ✅ |
| **Post-compra: Satisfacción casa** | ✅ |
| **Post-compra: Check-in mantenimiento** | ✅ |
| **Post-compra: Referidos** | ✅ |
| **Post-compra: NPS** | ✅ |
| **Post-compra: Aniversario** | ✅ |

### 🧪 TESTING

| Categoría | Tests | Estado |
|-----------|-------|--------|
| Unit tests | 304 | ✅ |
| Post-compra tests | 65 | ✅ |
| E2E Lead Journey | 7 | ✅ |
| E2E Vendor Journey | 5 | ✅ |
| E2E CEO Journey | 5 | ✅ |

### 👥 EQUIPO ACTIVO

- 9 vendedores listos para recibir leads
- 1 CEO (Oscar) con acceso total
- 2 asesores hipotecarios
- 1 agencia marketing

### 📍 URLs PRODUCCIÓN

| Servicio | URL |
|----------|-----|
| Backend | https://sara-backend.edson-633.workers.dev |
| CRM | https://sara-crm-new.vercel.app |
| Videos | https://sara-videos.onrender.com |

**Sistema 100% operativo - Última verificación: 2026-01-29 (Sesión 7)**

---

## 📝 HISTORIAL DE CAMBIOS RECIENTES

### 2026-01-29 (Sesión 7) - Fix Comportamiento de Ventas

**Problema:** SARA actuaba como "asistente" pasiva en lugar de "vendedora experta"
- Decía "Le aviso a Vendedor Test para que te contacte"
- Usaba frases pasivas: "Sin problema", "Entendido"
- "quiero ver" activaba tour virtual en lugar de cita física

**Solución:**
1. Regla crítica en prompt: "QUIERE VER = AGENDAR CITA"
2. Corrección post-Claude: fuerza cierre de cita si cliente muestra interés
3. Fix detección negativo/positivo en ofertas
4. Respuestas hardcodeadas corregidas en leadMessageService

**Commits:** `bb3d7229`, `0ec6912d`, `d51a44eb`

### 2026-01-29 (Sesión 7 - Parte 2) - Fix Citadella del Nogal

**Problema:** SARA decía "El Nogal no lo tenemos" cuando SÍ lo tenemos (Villa Campelo/Galiano)

**Solución:**
1. Instrucciones reforzadas con frases prohibidas explícitas
2. Corrección automática post-Claude si dice "no tenemos El Nogal"
3. Reemplazo de "visitar El Nogal" → "visitar Villa Campelo/Galiano"

**Antes:** "El Nogal no lo tenemos disponible"
**Ahora:** "Tengo terrenos en Villa Campelo ($450k) y Villa Galiano ($550k)"

**Commit:** `c3d9defe`

### 2026-01-29 (Sesión 7 - Parte 3) - Fix "Ya compré en otro lado"

**Problema:** SARA seguía indagando cuando cliente ya compró con competencia

**Solución:**
1. Instrucciones para felicitar y cerrar amablemente
2. Corrección automática si Claude sigue indagando
3. Ofrecer atender referidos sin presión

**Antes:** "¿Qué tipo de propiedad compraste? Me da curiosidad..."
**Ahora:** "¡Muchas felicidades por tu nueva casa! 🎉 Si algún familiar busca casa..."

**Commit:** `18b3038f`

### 2026-01-29 (Sesión 7 - Parte 4) - Fixes Edge-Cases Adicionales

**20 edge-cases probados, 5 problemas corregidos:**

| Problema | Antes | Ahora |
|----------|-------|-------|
| RENTA | "Sí, tenemos rentas" | "Solo VENDEMOS, no rentamos" ✅ |
| PERSONA REAL | "Soy asesora real" | "Soy SARA, asistente virtual 🤖" ✅ |
| URGENCIA | Respuesta genérica | Lista entrega inmediata ✅ |
| ESCUELAS | Vaga | Informativa + cierre ✅ |
| ENGLISH | En español | En inglés + precios USD ✅ |

**Correcciones:**
1. **RENTA:** "En Santa Rita solo vendemos casas, no manejamos rentas"
2. **PERSONA REAL:** "Soy SARA, asistente virtual 🤖 Pero con gusto te conecto con asesor humano"
3. **URGENCIA:** Lista Monte Verde, Los Encinos, Andes como entrega inmediata
4. **ENGLISH:** Detecta inglés → responde en inglés con precios MXN y USD

**Archivos:** `aiConversationService.ts`, `index.ts`

**Deploy:** Version ID `934ff302-8954-4bcc-9a98-b10e46e44a81`

### 2026-01-29 (Sesión 7 - Parte 5) - Respetar No Contacto

**Problema:** SARA ignoraba peticiones de no contacto y seguía vendiendo.

**Casos corregidos:**

| Mensaje | Antes | Ahora |
|---------|-------|-------|
| "ya no me escribas" | Vendía | "Respeto tu decisión" ✅ |
| "dejame en paz" | Preguntaba | "Respeto tu decisión" ✅ |
| "numero equivocado" | Vendía | "Disculpa la confusión" ✅ |

**25+ edge-cases probados:** competencia, objeciones, ubicación, especificaciones, financiamiento, mascotas, terrenos, personalización, inglés, USA.

**Commit:** `5f6aca3e`
**Deploy:** Version ID `c24bd307-931d-47e1-9d8b-e5a25c31941a`

### 2026-01-29 (Sesión 7 - Parte 6) - Fix Alberca

**Problema:** SARA decía que Distrito Falco tenía alberca (FALSO).

**Realidad:** SOLO **Priv. Andes** tiene ALBERCA.

| Mensaje | Antes | Ahora |
|---------|-------|-------|
| "tienen alberca" | "No incluyen" ❌ | "Sí, Andes tiene" ✅ |
| "cual tiene alberca" | "Distrito Falco" ❌ | "SOLO Andes" ✅ |

**Corrección:**
- Instrucciones reforzadas con lista explícita de desarrollos SIN alberca
- Post-procesamiento para corregir respuestas incorrectas
- Respuesta estandarizada: Laurel $1.5M, Lavanda $2.7M

**30+ edge-cases verificados**

**Commit:** `aa953096`
**Deploy:** Version ID `60e1fc3b-78ae-4439-8656-c6a8a6f6c8ef`

### 2026-01-29 (Sesión 7 - Parte 7) - Manejo de Mensajes Multimedia

**Problema:** SARA no manejaba mensajes que no fueran texto puro.

**Tipos de mensaje ahora soportados:**

| Tipo | Antes | Ahora |
|------|-------|-------|
| 🎤 **Audio/Voz** | Ignorado | Transcribe con Whisper → procesa |
| 😄 **Stickers** | Ignorado | "¡Me encanta! ¿Buscas casa?" |
| 📍 **Ubicación** | Ignorado | Info de zonas de Zacatecas |
| 🎬 **Video** | Ignorado | "Prefiero texto ¿Qué necesitas?" |
| 👤 **Contacto** | Ignorado | "¿Le escribo o le das mi número?" |
| 👍 **Reacciones** | Ignorado | Log silencioso (no spam) |
| 😊 **Emoji solo** | IA genérica | Respuesta específica por tipo |

**Interpretación de emojis:**
- 👍 👌 ❤️ → "¿Agendar visita?"
- 👎 😢 → "¿Algo te preocupa?"
- 🤔 → "¿Tienes dudas?"
- 🏠 → "¿2 o 3 recámaras?"
- 💰 → "Desde $1.5M..."

**Flujo de audio:**
```
WhatsApp → Descarga → Whisper transcribe → SARA responde
         ↓ si falla
         "¿Podrías escribirme tu mensaje?"
```

**Archivo:** `src/index.ts` (webhook handler)

**Commit:** `e2d445b3`
**Deploy:** Version ID `92e10885-18e7-4fbe-ba3f-c524b84e13fa`

### 2026-01-29 (Sesión 7 - Parte 8) - QA Completo 40+ Tests

**Pruebas exhaustivas ejecutadas:**

| Categoría | Tests | Resultado |
|-----------|-------|-----------|
| Financiamiento (INFONAVIT, FOVISSSTE, enganche, tasa) | 4 | ✅ |
| Objeciones (caro, pensar, lejos, competencia) | 4 | ✅ |
| Casos extremos (English, requisitos, crédito, lotes) | 4 | ✅ |
| Especificaciones (barata, grande, estacionamiento, vigilancia) | 4 | ✅ |
| Desarrollos (Monte Verde, Falco, Andes, Nogal) | 4 | ✅ |
| Fixes críticos (mascotas, no interesa, renta, ya compré) | 4 | ✅ |
| No contacto (no escribas, paz, equivocado, persona) | 4 | ✅ |
| Adicionales (urgencia, escuelas, local, cotización) | 4 | ✅ |
| Básicos (ok, gracias, hola, desarrollos) | 4 | ✅ |
| Fuera de tema (hamburguesas, pizza, medicinas, coches) | 4 | ✅ |

**Verificación de respuestas fuera de tema:**

| Pregunta | Respuesta SARA |
|----------|----------------|
| "venden hamburguesas" | "vendemos casas, no hamburguesas" ✅ |
| "quiero una pizza" | "te equivocaste de número" ✅ |
| "venden medicinas" | "vendemos casas, no medicamentos" ✅ |
| "busco carro usado" | "nos especializamos en casas" ✅ |
| "cuéntame un chisme" | "¡Hay casas desde $1.5M!" 😄 ✅ |
| "eres tonta" (insulto) | Ignora, sigue profesional ✅ |

**Follow-ups automáticos verificados:**

| Tiempo sin respuesta | Acción |
|---------------------|--------|
| 24h | Alerta vendedor |
| 48h | Re-engagement |
| 3 días | Follow-up 1 |
| 7 días | Follow-up 2 |
| 14 días | Follow-up 3 |
| 21+ días | Lead FRÍO |

**Sistema 100% operativo con 304 tests unitarios**

---

### 2026-01-29 (Sesión 7 - Parte 9) - Fix Nombres Alucinados + Análisis Conversaciones

**Problema detectado en análisis de conversaciones reales:**
Claude inventaba nombres cuando el lead no tenía nombre en la base de datos.

**Caso real encontrado (Oscar - 5214929090486):**
- Mensaje [11]: SARA dijo "¡Hola de nuevo María!"
- Oscar corrigió: "No soy Maria"
- Causa: Claude alucinó el nombre "María" sin ninguna base

**Solución implementada:**

1. **Lista expandida de 46 nombres comunes** que Claude podría inventar:
```
Salma, María, Maria, Juan, Pedro, Ana, Luis, Carlos, Carmen, José...
Guadalupe, Lupita, Javier, Sergio, Adriana, Claudia, Monica, etc.
```

2. **Dos casos de manejo:**

| Caso | Condición | Acción |
|------|-----------|--------|
| **1** | lead.name existe | Reemplazar nombre falso → nombre real |
| **2** | lead.name NO existe | ELIMINAR nombre inventado |

3. **Patrones de eliminación automática:**
```
"¡Hola de nuevo María!" → "¡Hola de nuevo!"
"Perfecto María," → "Perfecto,"
"Listo María!" → "¡Listo!"
```

**Análisis de conversaciones realizado:**

| Estadística | Valor |
|-------------|-------|
| Total leads con historial | 25 |
| Mensajes últimas 24h | 26 |
| Mensajes truncados recientes | 0 ✅ |
| Nombres alucinados detectados | 1 (Oscar→María) |

**Estado de problemas:**

| Problema | Estado | Notas |
|----------|--------|-------|
| Nombres alucinados | ✅ CORREGIDO | Fix deployado |
| Mensajes truncados | ✅ RESUELTO | Era histórico, 0 recientes |
| Citadella del Nogal | ✅ FUNCIONANDO | Responde Villa Campelo/Galiano |

**Commits:**
- `8d9b2d92` - fix: eliminar nombres alucinados cuando no hay lead.name
- `3f6b17ec` - docs: agregar fix de nombres alucinados a documentación

**Deploy:** Version ID `639ae8f5-8a9a-468e-ab0a-ac7bb9dfa300`

---

## 📊 RESUMEN SESIÓN 7 COMPLETA (2026-01-29)

**Total de fixes aplicados:** 9 partes

| Parte | Fix | Commit |
|-------|-----|--------|
| 1 | SARA cierra citas directamente | `d51a44eb` |
| 2 | Citadella del Nogal = Villa Campelo/Galiano | `c3d9defe` |
| 3 | "Ya compré en otro lado" → felicitar | `18b3038f` |
| 4 | Renta, persona real, urgencia, English | `934ff302` |
| 5 | Respetar no contacto | `5f6aca3e` |
| 6 | Alberca SOLO en Andes | `aa953096` |
| 7 | Mensajes multimedia (audio, stickers, etc.) | `e2d445b3` |
| 8 | QA 40+ tests verificados | (documentación) |
| 9 | Eliminar nombres alucinados sin lead.name | `8d9b2d92` |

**Tests:** 304 unitarios (todos pasan)

**Sistema 100% operativo - Última verificación: 2026-01-29**

---

## 📊 RESUMEN SESIÓN 8 COMPLETA (2026-01-30)

### Parte 1: Optimización de Costos
- Prompt reducido: 75,177 → 68,977 chars (~8% ahorro)
- Eliminadas líneas decorativas y emojis redundantes

### Parte 2: Documentación de APIs
- `docs/api-reference.md` actualizado con 50+ endpoints
- Secciones: auth, leads, citas, créditos, webhooks, etc.

### Parte 3: QA y Monitoreo
- 12/12 tests de conversaciones reales
- Monitoreo: 38 leads, 18 team activos
- Prompt adicional: -827 chars
- Schemas Supabase documentados (10 tablas)

### Parte 4: Calidad y Edge Cases

**Nuevas funcionalidades:**

1. **Detección de mensajes duplicados** (`leadMessageService.ts`)
   - Si lead envía 3+ mensajes idénticos → respuesta especial con menú
   - Previene spam y loops

2. **Endpoint de calidad** (`/api/metrics/quality`)
   - Analiza respuestas de SARA de últimos N días
   - Detecta: truncados, nombres inventados, frases prohibidas
   - Agrupa por tipo y genera recomendaciones

3. **Limpieza de código**
   - Eliminado `index.ts.backup` (22,701 líneas de código muerto)

4. **13 nuevos tests de edge cases** (`aiResponses.test.ts`)
   - Emojis solos (👍, 🏠)
   - Mensajes largos
   - Local comercial
   - Horarios de atención
   - Competencia (no criticar)
   - Spanglish
   - Typos comunes
   - Mensajes duplicados/spam
   - Urgencia de compra
   - Financiamiento (no inventar tasas)
   - Mascotas
   - Preguntas fuera de tema

**Commits Sesión 8:**

| Commit | Descripción |
|--------|-------------|
| `2cb10ba5` | perf: optimize prompt size |
| `3817e382` | docs: update api-reference |
| `d6f31ac2` | perf: remove duplicate objeciones |
| `0b66b9a1` | docs: database schemas |
| `2a36b614` | feat: quality metrics, duplicate detection, edge cases |
| `69b68744` | docs: update with quality metrics |

**Tests:** 291 → **304** (todos pasan)

---

## 📊 RESUMEN SESIÓN 11 (2026-01-30)

### Fix Crítico: Mensajes Interactivos

**Problema:** Vendedor respondía "2" a lista "¿LLEGÓ?" pero SARA enviaba saludo genérico.

**Causa:** Webhook solo leía `message.text.body`, ignorando `message.interactive.list_reply`.

**Fix (`index.ts`):**
```typescript
if (messageType === 'interactive') {
  if (interactiveType === 'list_reply') {
    text = message.interactive.list_reply?.id;
  } else if (interactiveType === 'button_reply') {
    text = message.interactive.button_reply?.id;
  }
}
```

### Nuevo Endpoint QA

`/test-interactive-responses` - Verifica extracción de mensajes interactivos (3 tests, catálogo de 9 tipos)

### Auditoría de Templates

13 templates verificados - todos tienen handler o contexto adecuado.

### Commits Sesión 11

| Commit | Descripción |
|--------|-------------|
| `0a11d385` | fix: handle interactive message responses |
| `fd3dc0d9` | feat: add /test-interactive-responses endpoint |
| `568d2dc4` | docs: document template response handling |
| `0ae39700` | docs: add endpoint documentation |

**Tests:** 351/351 pasando ✅

**Deploy:** `e4843ecf-ff9b-47bb-8a66-3ddd267772ca`

---

**Sesión 11 Parte 2 (Optimización del Prompt)**

Optimización agresiva del prompt de IA para reducir costos.

### Secciones Optimizadas

| Sección | Antes | Después | Reducción |
|---------|-------|---------|-----------|
| MENTALIDAD DE VENDEDOR | ~30 líneas | 5 líneas | 83% |
| FLUJO DE VENTA EXPERTO | ~95 líneas | 15 líneas | 84% |
| **Total** | ~125 líneas | 20 líneas | **84%** |

### Métricas de Ahorro

| Métrica | Valor |
|---------|-------|
| Líneas eliminadas | 129 |
| Líneas agregadas | 18 |
| Reducción neta | 111 líneas |
| Tokens ahorrados/mensaje | ~2,100 |

### Ahorro Acumulado (Sesiones 8+11)

| Sesión | Ahorro | Descripción |
|--------|--------|-------------|
| Sesión 8 | ~8% | Líneas decorativas, emojis |
| Sesión 11 | ~12% | Secciones verbosas |
| **Total** | **~20%** | **~$360/año** |

### Commits Sesión 11 Parte 2

| Commit | Descripción |
|--------|-------------|
| `6750602d` | perf: optimizar prompt reduciendo 105 líneas |
| `6dfd9e93` | docs: agregar Sesión 11 Parte 2 a CLAUDE.md |

**Deploy:** `52eaf0dd-9594-409a-b14d-f7f6273fc50a`

---

**Sesión 11 Parte 3 (Análisis + Fix Alberca + Optimización)**

### Análisis de Respuestas

| Test | Resultado |
|------|-----------|
| Saludo, Monte Verde, Muy caro | ✅ |
| El Nogal, Renta, Ya compré | ✅ |
| **Alberca** | ❌→✅ Fix aplicado |

### Fix: Detección de Alberca

SARA decía "no manejamos casas con alberca" pero **Priv. Andes SÍ tiene**.

Agregadas detecciones: `no manejamos`, `instalar alberca`, `futura alberca`, etc.

### Optimización Adicional

| Sección | Reducción |
|---------|-----------|
| Formato visual | 26→2 líneas |
| Datos/Nombres | 31→5 líneas |
| Citas/Tasas | 54→4 líneas |
| Recursos/Créditos | 38→2 líneas |
| **Total** | **139 líneas menos** |

### Ahorro Acumulado (Sesiones 8+11)

| Total | ~25% tokens | ~$450/año |

### Commits Sesión 11 Parte 3

| Commit | Descripción |
|--------|-------------|
| `e3df4f2e` | perf: optimizar prompt + fix alberca detection |

**Deploy:** `50fbcd32-802f-48e4-8c58-ea9c9165c502`

---

**Sesión 11 Parte 4 (Optimización Agresiva + Tests en Vivo)**

### Secciones Optimizadas

| Sección | Antes | Después | Reducción |
|---------|-------|---------|-----------|
| RESPUESTAS CORTAS | 40 líneas | 4 líneas | 90% |
| POST-VENTA/OTRO LADO | 35 líneas | 5 líneas | 86% |
| SEGURIDAD/SERVICIOS/DISTANCIAS | 46 líneas | 5 líneas | 89% |
| QUEJAS/PERSONALIDAD | 65 líneas | 12 líneas | 82% |
| FINANCIAMIENTO/PLÁTICA | 65 líneas | 8 líneas | 88% |
| RECORDATORIO FINAL | 25 líneas | 2 líneas | 92% |
| SEND_CONTACTOS | 15 líneas | 1 línea | 93% |
| QUIERE VER = CITA | 25 líneas | 2 líneas | 92% |
| **Total** | **316 líneas** | **39 líneas** | **88%** |

### Métricas

| Métrica | Valor |
|---------|-------|
| Archivo | 7,699 → 7,355 líneas |
| Reducción | -344 líneas |

### Tests en Vivo (20/20 ✅)

| Test | Resultado |
|------|-----------|
| Citadella del Nogal | ✅ Villa Campelo + Galiano |
| No me contactes | ✅ Respeta decisión |
| INFONAVIT | ✅ Confirma que aplica |
| English | ✅ Responde en inglés + USD |
| Persona real | ✅ "Soy asistente virtual" |
| Me urge | ✅ Entrega inmediata |
| Hamburguesas | ✅ "Somos inmobiliaria" |
| Mascotas | ✅ Pet-friendly |
| Número equivocado | ✅ Maneja amablemente |
| Competencia | ✅ No critica, destaca valor |
| Solo emoji 👍 | ✅ Responde y pregunta |
| Lo voy a pensar | ✅ Intenta rescatar |
| Terreno | ✅ Villa Campelo/Galiano |
| Tasa interés | ✅ Rango general, no inventa |
| 3 rec económica | ✅ Lista por precio |
| Monte Verde | ✅ 5 modelos con precios |
| Queja | ✅ Pregunta problema |
| Ubicación | ✅ Lista desarrollos |
| Typo "informasion" | ✅ Entiende correctamente |
| "Sí quiero" | ✅ Continúa flujo |

### Ahorro Acumulado Total (Sesiones 8+11)

| Sesión | Reducción | Descripción |
|--------|-----------|-------------|
| Sesión 8 | ~8% | Líneas decorativas, emojis |
| Sesión 11 Parte 2 | ~12% | MENTALIDAD, FLUJO DE VENTA |
| Sesión 11 Parte 3 | ~5% | FORMATO, DATOS, CITAS |
| Sesión 11 Parte 4 | ~5% | RESPUESTAS, SEGURIDAD, PERSONALIDAD |
| Sesión 11 Parte 5 | ~1% | REGLAS CITA, INTENTS, FLAGS |
| **Total** | **~31%** | **~$560/año ahorro** |

### Commits Sesión 11 Parte 4

| Commit | Descripción |
|--------|-------------|
| `e2981ded` | perf: optimizar prompt de IA - Sesión 11 Parte 4 |
| `cecce0f9` | docs: agregar Sesión 11 Parte 4 a documentación |

**Deploy:** `c6df2364-5f23-4947-9476-7c562a83e9f1`

---

**Sesión 11 Parte 5 (Optimización Final)**

### Secciones Compactadas

| Sección | Antes | Después | Reducción |
|---------|-------|---------|-----------|
| REGLAS DE CITA | 42 líneas | 5 líneas | 88% |
| INTENTS | 24 líneas | 3 líneas | 88% |
| FLAGS | 14 líneas | 6 líneas | 57% |
| **Total** | **80 líneas** | **14 líneas** | **82%** |

### Métricas

| Métrica | Valor |
|---------|-------|
| Archivo | 7,355 → 7,286 líneas |
| Reducción | -69 líneas |

### Commits Sesión 11 Parte 5

| Commit | Descripción |
|--------|-------------|
| `c85a3c83` | perf: optimizar prompt - Sesión 11 Parte 5 |

**Deploy:** `5950330e-72a6-4b0c-9971-72eb72653ea7`

---

## 2026-01-31 (Sesión 12) - Sistema de Templates para Mensajes al Equipo

### Problema Resuelto
Mensajes al equipo (briefings, reportes, resúmenes) no llegaban cuando la ventana de 24h estaba cerrada.

### Solución Implementada

| Situación | Acción |
|-----------|--------|
| Ventana 24h abierta | Mensaje directo |
| Ventana 24h cerrada | Template `reactivar_equipo` + pending |
| Team member responde | Se entrega mensaje pendiente |

### Archivos Modificados

| Archivo | Cambio |
|---------|--------|
| `src/utils/teamMessaging.ts` | Lógica de ventana 24h con templates |
| `src/index.ts` | Nuevo endpoint `/test-pending-flow` |

### Pending Keys por Tipo

| tipoMensaje | Pending Key |
|-------------|-------------|
| `briefing` | `pending_briefing` |
| `reporte_diario` | `pending_reporte_diario` |
| `resumen_semanal` | `pending_resumen_semanal` |
| `reporte` | `pending_reporte` |
| `notificacion` | `pending_mensaje` |

### Nuevo Endpoint
`/test-pending-flow?phone=X&nombre=Y&api_key=Z` - Prueba flujo completo de pending messages

### Commits Sesión 12

| Commit | Descripción |
|--------|-------------|
| `b4b40c0d` | feat: sistema de templates para mensajes al equipo con ventana 24h |
| `4b92908d` | fix: briefings y recaps ahora respetan ventana 24h |
| `69b14eed` | fix: corregir respuestas de alberca, tasas y brochure |
| `e5d1d7f6` | refactor: unificar test-ai-response con AIConversationService |

---

## 2026-01-31 (Sesión 12 - Parte 3) - Unificación de test-ai-response

### Problema
El endpoint `/test-ai-response` tenía ~320 líneas de código DUPLICADO. Cada fix en `AIConversationService` requería un fix separado, causando bugs recurrentes.

### Solución
Refactorizar para usar `AIConversationService` directamente, eliminando código duplicado.

### Correcciones Mejoradas

| Caso | Antes | Ahora |
|------|-------|-------|
| **Alberca** | Solo corregía si decía "no tenemos" | También corrige si ignora la pregunta |
| **Brochure** | Solo corregía si decía "no tengo" | También corrige si ignora la pregunta |
| **Tasas** | Solo corregía si inventaba % | Siempre redirige a bancos |

### Tests Verificados

| Pregunta | Respuesta |
|----------|-----------|
| "tienen casas con alberca" | ✅ "Priv. Andes es el único con ALBERCA" |
| "tienen brochure" | ✅ Lista desarrollos con precios |
| "cual es la tasa de interes" | ✅ "Consulta INFONAVIT/bancos" |
| "Citadella del Nogal" | ✅ "¿Sábado o domingo?" |

### Beneficios
- Eliminado ~300 líneas de código duplicado
- Un solo lugar para correcciones de IA
- Tests y producción usan el mismo código
- Bugs no pueden recurrir

**Deploy:** `59d788b3-a081-4fb0-8b22-5f069483ebbd`

---

## 2026-02-01 (Sesión 13) - QA Sistemático Completo

### Pruebas Exhaustivas Realizadas

Se ejecutaron pruebas sistemáticas de todos los flujos principales de SARA.

#### Pruebas de IA/Leads (17 tests)

| Test | Resultado |
|------|-----------|
| Saludo | ✅ Pregunta 2 o 3 recámaras |
| Monte Verde | ✅ Lista modelos con precios |
| Alberca | ✅ Solo Priv. Andes |
| Citadella/El Nogal | ✅ Villa Campelo + Villa Galiano |
| Renta | ✅ "Solo vendemos, no rentamos" |
| Ya compré otro lado | ✅ Felicita + referidos |
| No me escribas | ✅ Respeta decisión |
| Crédito INFONAVIT | ✅ Pregunta subcuenta |
| "Lo voy a pensar" | ✅ Urgencia + escasez |
| "Quiero ver casas" | ✅ "¿Sábado o domingo?" |
| Terrenos | ✅ Citadella del Nogal |
| Local comercial | ✅ Aclara residencial |
| Casa más grande | ✅ Calandria 3 plantas |
| Más barata | ✅ $1.5M Monte Verde/Andes |
| "Zacatecas lejos" | ✅ Maneja objeción |
| Área de juegos | ✅ Lista desarrollos |
| Enganche mínimo | ✅ 10% + INFONAVIT 100% |

#### Comandos Probados

| Rol | Comandos | Estado |
|-----|----------|--------|
| CEO | pipeline, alertas, ofertas | ✅ |
| Vendedor | cotizar, citas, mis leads, hot | ✅ |

#### CRONs Post-Compra

| CRON | Endpoint | Estado |
|------|----------|--------|
| Post-entrega | `/run-post-entrega` | ✅ |
| NPS | `/run-nps` | ✅ |
| Referidos | `/run-referidos` | ✅ |
| Post-visita | `/test-flujo-postvisita` | ✅ |

### Estado del Sistema

| Componente | Estado |
|------------|--------|
| Health | ✅ healthy |
| Supabase | ✅ ok (32 leads) |
| Tests unitarios | ✅ 351/351 pasan |

**Sistema 100% operativo - Última verificación: 2026-02-01**

---

## 2026-02-01 (Sesión 14) - Verificación Completa de Cobertura de Tests

### Auditoría Exhaustiva de Tests Unitarios (351 tests)

| Archivo | Tests | Cobertura |
|---------|-------|-----------|
| `asesorCommands.test.ts` | 32 | mis leads, docs, preaprobado, rechazado |
| `ceoCommands.test.ts` | 27 | leads, equipo, ventas, bridge, broadcast |
| `vendorCommands.test.ts` | 30 | citas, agendar, reagendar, brochure |
| `conversationLogic.test.ts` | 35 | Bridge logic, GPS, recursos |
| `postCompra.test.ts` | 47 | Post-entrega, satisfacción, NPS |
| `aiResponses.test.ts` | 44 | Alberca, Nogal, rentas, objeciones |
| `integration.test.ts` | 38 | Webhooks, auth, CORS, flujos |
| `newFeatures.test.ts` | 43 | Notas, historial, recap |

### Pruebas en Producción (42 tests)

| Categoría | Tests | Estado |
|-----------|-------|--------|
| IA Conversacional | 13 | ✅ |
| Comandos CEO | 18 | ✅ |
| CRONs Post-Compra | 6 | ✅ |
| APIs y Sistema | 5 | ✅ |

### Fix Citas Pasadas en Prompts

**Problema:** SARA mencionaba citas del pasado (ej: "visita del 30 de enero" cuando estamos a 1 de febrero).

**Fix:** Agregar `.gte('scheduled_date', hoy)` al query de citas + cambiar orden a `scheduled_date asc`.

**Commit:** `15ee1e01`

---

## 2026-02-01 (Sesión 15) - Fix Respuestas NPS Cortas

### Problema Detectado

Cuando un lead respondía "1" o "10" a una encuesta NPS, SARA enviaba respuesta genérica en lugar de procesar la respuesta NPS.

### Causa Raíz

1. Handler de emojis capturaba números (regex `\p{Emoji}` incluye dígitos)
2. Procesamiento de encuestas estaba dentro de bloque `text.length > 3`

### Fix Aplicado

```typescript
// 1. Excluir números puros del handler de emojis
const esPuroNumero = /^\d+$/.test(textoLimpio);
const esEmojiSolo = textoLimpio.length <= 4 && !esPuroNumero;

// 2. Procesar encuestas PRIMERO sin restricción de longitud
if (text) {  // Antes: if (text && text.length > 3)
  const npsProcessed = await procesarRespuestaNPS(...);
  if (npsProcessed) return new Response('OK');
}
```

### QA Mensajes Multimedia (15 tests)

| Tipo | Test | Estado |
|------|------|--------|
| Audio/Voz 🎤 | ✅ | OK |
| Emoji solo 😊 | ✅ | OK |
| Sticker 😄 | ✅ | OK |
| Ubicación 📍 | ✅ | OK |
| Documento 📄 | ✅ | OK |
| Imagen 🖼️ | ✅ | OK |
| Video 🎬 | ✅ | OK |
| Contacto 👤 | ✅ | OK |
| Reacción 👍/👎 | ✅ | OK |
| Button reply | ✅ | OK |
| List reply | ✅ | OK |

**Commit:** `94a9cdd9`
**Deploy:** Version ID `2413db6a-eec5-4c3e-a933-3155d046fc37`

---

## 2026-02-01 (Sesión 16) - Detección de Fotos de Desperfectos

### Nueva Funcionalidad para Clientes Post-Entrega

Cuando un cliente con status `delivered`, `sold` o `closed` envía una foto de desperfecto:

| Situación | Acción de SARA |
|-----------|----------------|
| Foto con caption de desperfecto | ✅ Notifica vendedor + CEO + confirma al cliente |
| Foto sin caption (cliente post-entrega) | ✅ Notifica equipo + pide descripción |
| Foto con problema (lead normal) | ✅ Ofrece casas nuevas como alternativa |
| Foto sin caption (lead normal) | ✅ Respuesta genérica mejorada |

### Palabras Clave Detectadas

```
humedad, goteras, grieta, fisura, rotura, daño, desperfecto,
mancha, moho, filtración, pintura, descascarado,
puerta, ventana, no cierra, piso, azulejo, tubería,
drenaje, atascado, luz, eléctrico, techo, plafón
```

### Flujo de Reporte

```
Cliente post-entrega envía foto de humedad
  ├── 📤 Notifica vendedor: "🚨 REPORTE DE CLIENTE - [nombre] envió foto"
  ├── 📤 Notifica CEO: "🚨 REPORTE POST-ENTREGA"
  ├── 💬 Responde al cliente: "Tu reporte ha sido registrado..."
  └── 📝 Guarda nota en el lead
```

### Archivo Modificado

`src/index.ts` (líneas 5901-5980)

**Commit:** `5d5bae57`
**Deploy:** Version ID `73d443fb-7367-4400-9280-c9c462b23a55`

---

## 2026-02-01 (Sesión 16 - Parte 2) - QA Exhaustivo 50+ Tests

### Pruebas Ejecutadas

| Categoría | Tests | Estado |
|-----------|-------|--------|
| Fotos de desperfectos | 4 | ✅ |
| Preguntas de información | 14 | ✅ |
| Perfiles de cliente | 6 | ✅ |
| Mensajes especiales | 7 | ✅ |
| Escenarios diversos | 19+ | ✅ |

### Preguntas de Información Probadas

- Amenidades (gym, áreas verdes)
- Tiempo de entrega
- Plusvalía/inversión
- Documentos necesarios
- Proceso de compra
- Horarios de atención
- Apartado inicial
- Promociones/descuentos
- Mensualidades
- Casa amueblada/una planta
- Ampliación posterior
- Negocio en casa

### Perfiles de Cliente Probados

- Pareja joven recién casados
- Persona en buró de crédito
- Mudanza de otra ciudad
- Freelancer sin nómina
- Expatriado en USA
- Copropiedad (hermanos)

### Mensajes Especiales Probados

- Múltiples emojis (🏠❤️👍)
- "ok" simple
- Expresión de frustración
- Portugués
- Mensaje informal/voz
- Solicitud de humano

**Deploy:** Version ID `f71281b4-2578-4ac1-a49a-86500dc5143d`

**Sistema 100% operativo - Última verificación: 2026-02-01**

---

### 2026-02-15 (Sesión 44) - Robustecimiento de Encuestas/Cuestionarios

Auditoría de 7 flujos de encuesta reveló 8 problemas. 7 fixes aplicados.

| # | Fix | Archivo(s) |
|---|-----|-----------|
| 1 | Name crash: `(nombreLead \|\| 'amigo').split(' ')[0] \|\| 'amigo'` | `encuestasService.ts`, `whatsapp.ts` |
| 2 | Vendor notifications → `enviarMensajeTeamMember` (respeta 24h) | `nurturing.ts` (5 puntos) |
| 3 | Mark-before-send en 4 funciones de envío | `nurturing.ts` |
| 4 | TTL 48h + `isLikelySurveyResponse` en `pending_satisfaction_survey` | `whatsapp.ts` |
| 5 | Wamid tracking en envío de encuestas | `nurturing.ts` |
| 6 | Auto-cleanup CRON: `limpiarFlagsEncuestasExpirados()` (>72h, diario 7PM) | `nurturing.ts`, `index.ts` |
| 7 | Audit trail: `surveys_sent` array en notes (rolling últimos 10) | `nurturing.ts` |

**Tests:** 369/369 pasando
**Commit:** `429ac260`
**Deploy:** Version ID `1e542c66`

---

### 2026-02-28 (Sesión 72) - Conectar 3 Servicios Desconectados al Flujo de Conversación

3 servicios que estaban implementados pero NO conectados al flujo real de leads fueron integrados:

#### 1. FinancingCalculatorService → intent `info_credito`

Cuando un lead pregunta por crédito y tiene `property_interest`, SARA ahora muestra una tabla comparativa de bancos (BBVA, Banorte, Santander, HSBC, etc.) con mensualidades estimadas ANTES del menú de opciones de crédito.

| Archivo | Cambio |
|---------|--------|
| `aiConversationService.ts` | Lazy import + `compareBanks()` + `formatComparisonForWhatsApp()` en bloque `info_credito` |

#### 2. InventoryService → Fix bug + wire en `executeAIDecision`

| Archivo | Cambio |
|---------|--------|
| `inventoryService.ts` | Eliminado `.eq('status', 'available')` (columna no existe en `properties`) |
| `inventoryService.ts` | Fix `formatPropertyInfo()` y `formatPropertyCard()` para usar campos correctos de DB |
| `aiConversationService.ts` | Wire `getPropertyByModel()` + `formatPropertyInfo()` cuando lead pregunta por modelo específico |

#### 3. BrokerHipotecarioService → Wire en image handler

Cuando un lead con `needs_mortgage=true` + asesor asignado envía una imagen, SARA la procesa como documento hipotecario (INE, nómina, comprobante domicilio) usando OpenAI Vision API.

| Archivo | Cambio |
|---------|--------|
| `brokerHipotecarioService.ts` | Acepta data URLs base64 (Meta URLs requieren auth headers que OpenAI no puede proveer) |
| `index.ts` | Wire entre credit flow check y desperfecto handler: descarga media como base64, crea data URL, procesa con BrokerService |
| `index.ts` | Notifica asesor + vendedor original cuando todos los docs están completos (24h-safe) |

#### SQL: tabla `documentos_broker`

```sql
-- Ejecutado en Supabase Dashboard
CREATE TABLE IF NOT EXISTS documentos_broker (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  media_url TEXT,
  datos_extraidos JSONB,
  valido BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- + 3 índices (lead_id, tipo, lead_id+tipo)
```

**Tests:** 798/798 pasando
**Commit:** `2d82d424`
**Deploy:** Version ID `9a2a9be3`

#### Verificación en Producción (completa)

| Suite | Resultado |
|-------|-----------|
| Health check | ✅ allPassed, 19 team members, 32 properties |
| FinancingCalculator (crédito + Monte Verde) | ✅ Intent info_credito, desarrollo detectado, opciones de 8 bancos |
| InventoryService (modelo Eucalipto) | ✅ Precio $2.01M, 2 recámaras, card formateada |
| BrokerHipotecarioService | ✅ Wired en image handler (requiere lead con needs_mortgage=true) |
| Retell E2E | ✅ 25/25 passed |
| CEO commands | ✅ Detecta y ejecuta |
| Vendedor commands | ✅ Detecta y ejecuta |
| Asesor commands | ✅ Detecta y ejecuta |
| Agencia commands | ✅ Detecta y ejecuta |
| Resilience E2E | ✅ 12/12 passed |
| Error logs | ✅ Limpios (3 errores de endpoints eliminados resueltos) |

**Push:** origin/main (`2d82d424` + `0738d21d`)

---

## Sesión 80 (2026-03-03) - Intent Tagging + Churn Prediction + Mortgage Recovery

### 3 Features implementadas

**Feature 1: Intent Tagging & Buyer Readiness**
- `aiConversationService.ts`: Persiste `notes.intent_history[]` (max 20) con intent, timestamp, sentiment en cada mensaje
- `leadScoring.ts`: `computeBuyerReadiness(intentHistory)` — pesos por intent + decay temporal 30d
- `leadScoring.ts`: `calcularLeadScore()` integra buyer_readiness (+3 si ≥40, +1 si ≥15)

**Feature 2: Churn Prediction**
- `leadScoring.ts`: `computeChurnRisk(lead, notas)` — 5 señales: inactividad (40pts), sentimiento negativo (15pts), re-engagement agotado (20pts), buyer readiness bajo (10pts), objeciones (10pts)
- `leadScoring.ts`: `actualizarLeadScores()` calcula churn_risk en el mismo write que score (sin doble write)
- `alerts.ts`: `alertarChurnCritico()` — CRON cada 2h pares L-S, max 5 alertas/run, cooldown 48h
- `followups.ts`: Escalación en paso3 re-engagement — si churn=critical, notifica vendedor antes de marcar frío
- `index.ts`: CRON dispatch para `alertarChurnCritico`

**Feature 3: Mortgage Recovery**
- `asesorCommandsService.ts`: `notificarRechazado()` categoriza motivo (buró/ingresos/docs/deuda/otro), guarda `notes.mortgage_recovery`, mensaje personalizado por categoría
- `followups.ts`: `recuperacionHipotecasRechazadas()` — día 7 envía alternativas, día 30 notifica reintento + alerta equipo
- `index.ts`: CRON L/Mi/Vi 10am MX

### Archivos modificados
| Archivo | Cambio |
|---------|--------|
| `src/services/aiConversationService.ts` | Persistir intent_history + buyer_readiness |
| `src/crons/leadScoring.ts` | `computeBuyerReadiness()`, `computeChurnRisk()`, integrado en scoring |
| `src/crons/alerts.ts` | `alertarChurnCritico()` |
| `src/crons/followups.ts` | Escalación paso3, `recuperacionHipotecasRechazadas()` |
| `src/services/asesorCommandsService.ts` | Categorizar rechazo, mortgage_recovery, mensaje mejorado |
| `src/index.ts` | 2 CRON dispatches + imports |

**Tests:** 1107/1107 pasando (33 archivos)
