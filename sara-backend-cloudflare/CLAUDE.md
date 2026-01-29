# SARA CRM - Memoria Principal para Claude Code

> **IMPORTANTE**: Este archivo se carga automáticamente en cada sesión.
> Última actualización: 2026-01-29

---

## STACK TECNOLÓGICO

| Componente | Tecnología | Archivo/Carpeta |
|------------|------------|-----------------|
| Runtime | Cloudflare Workers | `wrangler.toml` |
| Base de datos | Supabase (PostgreSQL) | `src/services/supabase.ts` |
| Cache | Cloudflare KV | `SARA_CACHE` namespace |
| WhatsApp | Meta Cloud API | `src/services/metaWhatsAppService.ts` |
| IA Conversacional | Claude (Anthropic) | `src/services/claudeService.ts` |
| Videos | Google Veo 3 | `src/services/veoService.ts` |
| Calendar | Google Calendar API | `src/services/calendarService.ts` |
| Frontend CRM | React + Vercel | `sara-crm-new/` (repo separado) |

---

## ANTES DE HACER CUALQUIER COSA

```bash
# 1. Lee la documentación completa
cat SARA_COMANDOS.md | head -500

# 2. Verifica tests (OBLIGATORIO - 260 tests)
npm test

# 3. Si falla algún test, NO hagas cambios
```

---

## REGLAS CRÍTICAS (NO NEGOCIABLES)

1. **NO reimplementes** - Lee `SARA_COMANDOS.md` primero
2. **NO borres código** sin entender por qué existe
3. **NO modifiques** secciones marcadas `CRÍTICO - NO MODIFICAR`
4. **SIEMPRE** corre `npm test` antes de commit
5. **ACTUALIZA** `SARA_COMANDOS.md` con cada cambio

---

## ARCHIVOS CRÍTICOS (MANEJAR CON CUIDADO)

| Archivo | Líneas | Función | Riesgo |
|---------|--------|---------|--------|
| `src/index.ts` | ~14,300 | Router principal + CRONs | ALTO |
| `src/handlers/whatsapp.ts` | ~11,000 | Handler de mensajes | ALTO |
| `src/services/aiConversationService.ts` | ~7,300 | IA + prompts | ALTO |
| `src/services/creditFlowService.ts` | ~1,400 | Flujo hipotecario | MEDIO |

### Módulos CRON Extraídos (2026-01-29)

| Módulo | Líneas | Funciones |
|--------|--------|-----------|
| `src/crons/reports.ts` | ~400 | Reportes diarios/semanales |
| `src/crons/briefings.ts` | ~500 | Briefings matutinos, logEvento |
| `src/crons/alerts.ts` | ~450 | Alertas de leads, cumpleaños |
| `src/crons/followups.ts` | ~800 | Follow-ups, nurturing, broadcasts |
| `src/crons/leadScoring.ts` | ~550 | Scoring, señales calientes, objeciones |
| `src/crons/nurturing.ts` | ~700 | Recuperación crédito, NPS, referidos |
| `src/crons/maintenance.ts` | ~340 | Bridges, leads estancados, aniversarios |
| `src/crons/videos.ts` | ~710 | Videos Veo 3 personalizados |
| `src/crons/dashboard.ts` | ~700 | Status, analytics, health, backup |

### Servicios de Inteligencia de Negocio (2026-01-29)

| Servicio | Líneas | Funcionalidad |
|----------|--------|---------------|
| `src/services/pipelineService.ts` | ~700 | Pipeline de ventas, forecast, at-risk |
| `src/services/financingCalculatorService.ts` | ~550 | Calculadora hipotecaria, comparar bancos |
| `src/services/propertyComparatorService.ts` | ~500 | Comparador de propiedades |
| `src/services/closeProbabilityService.ts` | ~450 | Probabilidad de cierre ML-like |
| `src/services/visitManagementService.ts` | ~450 | Gestión de visitas y analytics |
| `src/services/offerTrackingService.ts` | ~650 | Tracking de ofertas/cotizaciones |
| `src/services/smartAlertsService.ts` | ~600 | Alertas proactivas inteligentes |
| `src/services/marketIntelligenceService.ts` | ~725 | Inteligencia de mercado y competencia |
| `src/services/customerValueService.ts` | ~565 | CLV, referidos, segmentación |
| `src/services/pdfReportService.ts` | ~700 | Generador de reportes PDF/HTML |
| `src/services/webhookService.ts` | ~500 | Webhooks salientes para integraciones |
| `src/services/cacheService.ts` | ~270 | Cache inteligente con KV |

### Secciones Protegidas

Busca estos comentarios antes de modificar:
```
╔════════════════════════════════════════════════════════════════════════╗
║  CRÍTICO - NO MODIFICAR SIN CORRER TESTS: npm test                     ║
╚════════════════════════════════════════════════════════════════════════╝
```

---

## TELÉFONOS DEL EQUIPO (ACTUALIZADOS)

| Rol | Teléfono | Nombre | Acceso |
|-----|----------|--------|--------|
| **CEO/Admin** | 5214922019052 | Oscar Castelo | TODOS los comandos |
| Vendedor Test | 5212224558475 | Vendedor Test | Solo vendedor |
| Asesor | 5214929272839 | Leticia Lara | Solo asesor (inactiva) |
| Asesor Test | 5210000000001 | Asesor Crédito Test | Solo asesor (inactivo) |

### Oscar (CEO) tiene acceso a TODOS los comandos

El CEO tiene fallback a todos los roles. Orden de prioridad:
1. **CEO** → equipo, ventas, leads, adelante/atrás, broadcast
2. **Asesor** → preaprobado, rechazado, contactado, docs
3. **Vendedor** → citas, mis leads, hot, briefing, nota, bridge
4. **Marketing** → campañas, metricas, segmentos, broadcast

---

## DESARROLLOS Y SINÓNIMOS

### Citadella del Nogal / El Nogal
- **NO EXISTE** como desarrollo independiente
- Son las villas: **Villa Campelo** y **Villa Galiano**
- Si preguntan por "Citadella del Nogal" o "El Nogal" → responder con Villa Campelo/Galiano
- Configurado en `aiConversationService.ts` sección "SINÓNIMOS DE DESARROLLOS"

### Colinas del Padre
- Desarrollo histórico con varias secciones/etapas
- El Nogal está en la misma zona

---

## FLUJOS DE NEGOCIO PRINCIPALES

### 1. Lead → Venta (Funnel)
```
new → contacted → qualified → visit_scheduled → visited → negotiating → reserved → sold → delivered
```

### 2. Bridge (Chat Directo)
- CEO/Vendedor escribe `bridge [nombre]`
- SARA activa chat directo por 6 minutos
- Mensajes se reenvían sin procesar
- `#cerrar` o `#mas` para controlar

### 3. Crédito Hipotecario
```
Lead pregunta por crédito → SARA hace preguntas de calificación →
Si califica → Asigna asesor → Asesor contacta
```
- El asesor se busca por `asesor_banco_id` en el lead
- Si no hay asesor activo, el CEO puede usar comandos de asesor

### 4. Videos Veo 3
```
Lead nuevo → Generar video personalizado → Subir a Meta → Enviar
```
**IMPORTANTE**: Usar `uploadVideoFromBuffer()` + `sendWhatsAppVideoById()`

### 5. Regla de 24 Horas de WhatsApp (CRÍTICO)
```
WhatsApp SOLO permite mensajes libres si el usuario escribió en las últimas 24h.
Si no hay ventana abierta → el mensaje NO LLEGA.
```

**Solución implementada:**
- Función `enviarMensajeTeamMember()` en index.ts
- Verifica `last_sara_interaction` del team member
- Si ventana abierta → envía mensaje directo
- Si ventana cerrada → envía template `reactivar_equipo` + guarda en `pending_*`
- Cuando responden → se entrega el mensaje pendiente

**Pending messages se verifican PRIMERO:**
- En `handleVendedorMessage` (whatsapp.ts ~línea 3810)
- En `handleCEOMessage` (whatsapp.ts ~línea 1520)
- ANTES de cualquier otra lógica (comandos, bridge, etc.)
- Actualiza `last_sara_interaction` al responder
- Hace `return` después de entregar (sin respuesta genérica)

**Pending keys soportados:**
- `pending_briefing` - Briefing de mañana (8 AM)
- `pending_recap` - Recap nocturno (7 PM, solo si no usó SARA)
- `pending_reporte_diario` - Reporte 7 PM
- `pending_reporte_semanal` - Reporte lunes

**Aplica a:** Leads, Vendedores, Coordinadores, Asesores, Marketing

---

## COMANDOS POR ROL

### CEO (Oscar - 5214922019052)

**REPORTES:**
| Comando | Función |
|---------|---------|
| `leads` / `hoy` | Ver leads del día |
| `briefing` | Briefing completo |
| `equipo` / `ventas` | Métricas del equipo |
| `conexiones` | Actividad de vendedores |
| `reporte semanal` | Reporte semanal |
| `reporte mensual` | Reporte mensual |
| `meta` / `metas` | Ver metas de ventas |

**ANÁLISIS:**
| Comando | Función |
|---------|---------|
| `pipeline` / `funnel` | Pipeline de ventas |
| `probabilidad` / `forecast` | Probabilidades de cierre |
| `visitas` | Gestión de visitas |
| `alertas` / `riesgos` | Alertas inteligentes |
| `mercado` / `competencia` | Inteligencia de mercado |
| `clv` / `referidos` | Valor del cliente |
| `segmentos` | Ver segmentos de leads |

**FINANCIAMIENTO:**
| Comando | Función |
|---------|---------|
| `calcular [precio]` | Calculadora hipotecaria |
| `bancos` | Comparativa de bancos |
| `comparar [A] vs [B]` | Comparar propiedades |

**COMUNICACIÓN:**
| Comando | Función |
|---------|---------|
| `bridge [nombre]` | Chat directo con lead |
| `#cerrar` / `#mas` | Controlar bridge |
| `mensaje [nombre] [texto]` | Enviar mensaje via SARA |
| `broadcast [mensaje]` | Envío masivo |
| `enviar a [segmento]: [msg]` | Broadcast a segmento |

**GESTIÓN LEADS:**
| Comando | Función |
|---------|---------|
| `adelante [nombre]` | Mover al siguiente status |
| `atrás [nombre]` | Mover al status anterior |
| `quién es [nombre]` | Ver info de lead |
| `historial [nombre]` | Ver conversación |
| `nota [nombre]: [texto]` | Agregar nota |
| `notas [nombre]` | Ver notas |
| `asignar [lead] a [vendedor]` | Reasignar lead |

**OFERTAS:**
| Comando | Función |
|---------|---------|
| `ofertas` / `cotizaciones` | Ver ofertas activas |
| `oferta [nombre]` | Ver detalle de oferta |

**RECURSOS:**
| Comando | Función |
|---------|---------|
| `brochure [desarrollo]` | Enviar brochure |
| `ubicación [desarrollo]` | Enviar GPS |
| `video [desarrollo]` | Enviar video |
| `propiedades` / `inventario` | Ver propiedades |

**+ Todos los comandos de Asesor, Vendedor y Marketing**

### Vendedor
| Comando | Función |
|---------|---------|
| `hoy` / `briefing` | Resumen del día |
| `citas` / `citas mañana` | Ver agenda |
| `mis leads` | Leads asignados |
| `hot` | Leads calientes |
| `pendientes` | Leads sin seguimiento |
| `meta` | Avance de meta mensual |
| `agendar cita [nombre] [fecha] [hora]` | Crear cita |
| `reagendar [nombre] [fecha] [hora]` | Cambiar cita |
| `cancelar cita [nombre]` | Cancelar cita |
| `adelante/atrás [nombre]` | Mover en funnel |
| `nota [nombre]: [texto]` | Agregar nota |
| `notas [nombre]` | Ver notas |
| `quién es [nombre]` | Info del lead |
| `historial [nombre]` | Ver conversación |
| `perdido [nombre]` | Marcar como perdido |
| `nuevo lead [nombre] [tel] [desarrollo]` | Crear lead |
| `crédito [nombre]` | Pasar a asesor |
| `asignar asesor [nombre]` | Asignar asesor específico |
| `bridge [nombre]` | Chat directo 6 min |
| `#cerrar` / `#mas` | Control de bridge |
| `llamar [nombre]` | Ver teléfono |
| `recordar llamar [nombre] [fecha]` | Programar llamada |
| `contactar [nombre]` | Enviar template 24h |
| `cotizar [nombre] [precio]` | Crear oferta |
| `enviar oferta [nombre]` | Enviar oferta |
| `ofertas` | Ver ofertas activas |
| `oferta aceptada/rechazada [nombre]` | Cambiar status |
| `brochure/ubicación/video [desarrollo]` | Enviar recursos |
| `cerrar venta [nombre] [propiedad]` | Registrar venta |
| `apartado [nombre] [propiedad]` | Registrar apartado |
| `coaching [nombre]` | Consejos IA |

### Asesor Hipotecario
| Comando | Función |
|---------|---------|
| `mis leads` | Leads de crédito asignados |
| `docs [nombre]` | Ver documentos |
| `preaprobado [nombre]` | Marcar preaprobado |
| `rechazado [nombre]` | Marcar rechazado |
| `contactado [nombre]` | Marcar contactado |
| `status` | Ver status de leads |
| `reporte` | Reporte de conversiones |
| `llamar [nombre]` | Ver teléfono del lead |

### Marketing/Agencia
| Comando | Función |
|---------|---------|
| `campañas` | Ver campañas activas |
| `metricas` | Ver métricas y CPL |
| `segmentos` | Ver segmentos disponibles |
| `broadcast` | Ayuda para envío masivo |
| `enviar a [segmento]: [mensaje]` | Enviar a segmento |

---

## ESTRUCTURA DE PROYECTO

```
sara-backend-cloudflare/
├── src/
│   ├── index.ts              # Router principal (~14K líneas)
│   ├── handlers/
│   │   └── whatsapp.ts       # Handler WhatsApp (11K líneas)
│   ├── crons/                # Módulos CRON extraídos
│   │   ├── reports.ts        # Reportes diarios/semanales
│   │   ├── briefings.ts      # Briefings, logEvento
│   │   ├── alerts.ts         # Alertas de leads
│   │   ├── followups.ts      # Follow-ups automáticos
│   │   ├── leadScoring.ts    # Scoring y objeciones
│   │   ├── nurturing.ts      # Nurturing y NPS
│   │   ├── maintenance.ts    # Bridges y mantenimiento
│   │   ├── videos.ts         # Videos Veo 3
│   │   └── dashboard.ts      # Status y analytics
│   ├── services/
│   │   ├── aiConversationService.ts  # IA (7K líneas)
│   │   ├── ceoCommandsService.ts
│   │   ├── vendorCommandsService.ts
│   │   ├── asesorCommandsService.ts
│   │   ├── agenciaCommandsService.ts
│   │   ├── bridgeService.ts
│   │   ├── creditFlowService.ts
│   │   ├── metaWhatsAppService.ts
│   │   ├── supabase.ts
│   │   └── ...69 servicios total
│   ├── utils/
│   │   └── conversationLogic.ts
│   └── tests/
│       └── ...11 archivos de test
├── wrangler.toml             # Config Cloudflare
├── SARA_COMANDOS.md          # Documentación detallada
└── CLAUDE.md                 # Este archivo
```

---

## DEPLOY

```bash
# 1. Tests (OBLIGATORIO)
npm test

# 2. Deploy a staging primero
npx wrangler deploy --env staging

# 3. Verificar staging
curl https://sara-backend-staging.edson-633.workers.dev/health

# 4. Deploy a producción
npx wrangler deploy

# 5. Verificar producción
curl https://sara-backend.edson-633.workers.dev/health

# 6. Ver logs en tiempo real
npx wrangler tail --format=pretty
```

---

## ENDPOINTS ÚTILES

| Endpoint | Método | Uso |
|----------|--------|-----|
| `/health` | GET | Status del sistema |
| `/test-vendedor-msg?phone=X&msg=Y&api_key=Z` | GET | Simular mensaje de vendedor |
| `/test-real?test=X` | GET | Tests de funcionalidad |
| `/debug-lead?phone=X` | GET | Debug de un lead |
| `/api/leads` | GET | Lista de leads (auth) |
| `/api/team-members` | GET | Lista de equipo (auth) |

**Autenticación**: Header `Authorization: Bearer <API_SECRET>` o `?api_key=<API_SECRET>`

---

## SI ALGO SALE MAL

```bash
# 1. Ver commits recientes
git log --oneline -5

# 2. Revertir último commit
git revert HEAD

# 3. Verificar tests
npm test

# 4. Re-deploy
npx wrangler deploy
```

---

## REGLAS ADICIONALES

Ver archivos en `.claude/rules/`:
- `whatsapp.md` - Reglas para código de WhatsApp
- `cloudflare.md` - Reglas para Cloudflare Workers
- `supabase.md` - Reglas para base de datos

Ver documentación en `docs/`:
- `architecture.md` - Diagramas de arquitectura
- `api-reference.md` - Referencia de APIs internas

---

## ESTADO DE INTEGRACIONES

| Integración | Estado | Notas |
|-------------|--------|-------|
| **Meta/WhatsApp** | ✅ Funcionando | Conexiones sin problema |
| Supabase | ✅ Funcionando | Base de datos principal |
| Cloudflare Workers | ✅ Funcionando | Runtime de producción |
| Google Calendar | ✅ Funcionando | Citas y eventos |
| Veo 3 (Videos) | ✅ Funcionando | Videos personalizados |

---

## ENDPOINTS DE PRUEBA (QA)

| Endpoint | Uso |
|----------|-----|
| `/test-ai-response?msg=X&api_key=Y` | Prueba respuestas de SARA (solo texto, no envía WhatsApp) |
| `/test-lead?phone=X&name=Y&msg=Z&api_key=W` | Flujo completo como lead real (SÍ envía WhatsApp) |
| `/test-vendedor-msg?phone=X&msg=Y&api_key=Z` | Simula mensaje de vendedor/CEO |
| `/test-ventana-24h` | Ver estado de ventana 24h de cada team member (público) |
| `/test-envio-7pm` | Dry-run del reporte 7 PM (público) |
| `/test-envio-7pm?enviar=true` | Envío real del reporte 7 PM |
| `/test-envio-7pm?enviar=true&phone=XXXX` | Envío real a un vendedor específico |

---

## QA COMPLETADO (2026-01-28)

### SARA responde correctamente:
- ✅ Preguntas de desarrollos (36 propiedades en catálogo)
- ✅ Citadella del Nogal = Villa Campelo + Villa Galiano
- ✅ Monte Verde, Distrito Falco, Los Encinos, Miravalle, Andes, etc.
- ✅ NO inventa información (dice "no tengo esa info")
- ✅ Maneja objeciones de precio
- ✅ Errores ortográficos entendidos

### Recursos enviados automáticamente:
- ✅ GPS cuando piden ubicación
- ✅ Brochure PDF cuando piden folleto
- ✅ Video cuando piden ver el desarrollo

### Flujos de negocio:
- ✅ Agendar citas (detecta fecha, hora, desarrollo)
- ✅ Crédito hipotecario (menciona bancos: BBVA, Banorte, Santander, HSBC, INFONAVIT, FOVISSSTE)
- ✅ Promoción automática en funnel (new → scheduled)

### Nota importante:
La tabla `properties` NO tiene columna `active`. Todas las propiedades se consideran activas.

---

## HISTORIAL DE CAMBIOS IMPORTANTES

### 2026-01-29 (Sesión 2)

**Servicios Avanzados de Inteligencia de Negocio:**

| Servicio | Comandos CEO | Endpoints API |
|----------|--------------|---------------|
| Offer Tracking | `ofertas`, `cotizaciones` | `/api/offers/*` |
| Smart Alerts | `alertas`, `riesgos` | `/api/alerts/*` |
| Market Intelligence | `mercado`, `competencia` | `/api/market/*` |
| Customer Value (CLV) | `clv`, `referidos` | `/api/clv/*` |
| PDF Reports | `reporte semanal`, `reporte mensual` | `/api/reports/*` |
| Webhooks | - | `/api/webhooks/*` |
| Cache Service | - | (interno) |

**Nuevas funcionalidades:**
- **Tracking de Ofertas**: Ciclo de vida de cotizaciones (draft → sent → viewed → negotiating → accepted → reserved → contracted)
- **Alertas Inteligentes**: Notificaciones proactivas para leads fríos, ofertas por vencer, citas próximas, vendedores inactivos
- **Inteligencia de Mercado**: Análisis de demanda, precios, competencia, fuentes y timing
- **CLV (Customer Lifetime Value)**: Perfiles de cliente, cadenas de referidos, segmentación (VIP, high_value, at_risk)
- **Reportes PDF**: Generador de reportes semanales/mensuales con HTML exportable
- **Webhooks**: Sistema de notificaciones a sistemas externos con retry y firma HMAC
- **Cache Optimizado**: Cache inteligente con Cloudflare KV, TTLs por tipo de dato

**Nuevos comandos CEO:**
```
mercado / inteligencia / competencia → Análisis de mercado
clv / valor cliente / referidos → Valor del cliente
reporte semanal / reporte mensual → Reportes completos
ofertas / cotizaciones / negociaciones → Tracking de ofertas
alertas / warnings / riesgos → Alertas inteligentes
```

### 2026-01-28
- QA exhaustivo completado: 21 pruebas de IA + flujo completo
- Nuevo endpoint `/test-ai-response` para pruebas de QA
- CEO (Oscar) ahora tiene acceso a TODOS los comandos (CEO + Asesor + Vendedor + Marketing)
- Agregado fallback de comandos en `handleCEOMessage` en whatsapp.ts
- Citadella del Nogal configurado como sinónimo de Villa Campelo/Galiano en aiConversationService.ts
- Teléfonos actualizados: Oscar = 5214922019052, Vendedor Test = 5212224558475
- Fix: query de properties sin filtro `active` (columna no existe)
- **CRÍTICO**: Fix ventana 24h de WhatsApp para mensajes a equipo
  - Nueva función `enviarMensajeTeamMember()` que respeta la ventana de 24h
  - Si ventana cerrada → envía template + guarda mensaje como pending
  - Cuando responden → se entrega el mensaje pendiente
  - Actualizado: reportes 7 PM vendedores, reportes asesores
- Nuevos endpoints de diagnóstico (públicos):
  - `/test-ventana-24h` - Ver estado de ventana de cada team member
  - `/test-envio-7pm` - Probar envío de reportes (dry-run o real)
- **CRÍTICO**: Pending messages ahora se verifican PRIMERO en handlers
  - Movido verificación de pending al INICIO de `handleVendedorMessage`
  - Movido verificación de pending al INICIO de `handleCEOMessage`
  - Esto garantiza que cuando responden al template, reciben el mensaje pendiente SIN respuesta genérica
  - También actualiza `last_sara_interaction` para abrir ventana 24h

### Tests de sistema completados (2026-01-28 15:23 CST):
| Test | Resultado |
|------|-----------|
| Health endpoint | ✅ 23 leads hoy, 3 citas |
| Envío DIRECTO (Javier) | ✅ Mensaje llegó |
| Envío TEMPLATE (Refugio) | ✅ Template + pending |
| Ventanas 24h | ✅ 5 abiertas / 13 cerradas |
| Dry-run masivo 7PM | ✅ 9 vendedores (4 directo, 5 template) |

### Flujo de reportes 7PM verificado:
```
9 vendedores activos
├── 4 ventana ABIERTA → Mensaje DIRECTO
│   ├── Francisco de la Torre
│   ├── Javier Frausto
│   ├── Karla Muedano
│   └── Fabian Fernandez
│
└── 5 ventana CERRADA → TEMPLATE + PENDING
    ├── Rosalia del Rio
    ├── Juanita Lara
    ├── Jimena Flores
    ├── Refugio Pulido
    └── Vendedor Test
```

### Tests E2E Customer + Vendor Journey (2026-01-28 16:00 CST):

**Teléfonos de prueba:**
- Lead: 5610016226 (Roberto García)
- Vendedor: 5212224558475 (Vendedor Test)

| Journey | Test | Resultado |
|---------|------|-----------|
| **Lead** | Pregunta por Distrito Falco | ✅ DELIVERED |
| **Lead** | SARA envía info 4 modelos + precios | ✅ DELIVERED |
| **Lead** | SARA envía video + recorrido 3D | ✅ DELIVERED |
| **Lead** | SARA inicia video Veo 3 personalizado | ✅ Generando |
| **Vendedor** | Comando `mis leads` | ✅ DELIVERED (15 leads) |
| **Vendedor** | Comando `citas` | ✅ DELIVERED (3 citas) |
| **Vendedor** | Comando `briefing` | ✅ DELIVERED |

**Sistema 100% funcional:**
- ✅ IA conversacional
- ✅ Detección de desarrollos
- ✅ Envío de recursos automático
- ✅ Comandos de vendedor
- ✅ Videos Veo 3
- ✅ Ventana 24h respetada

### Ciclo Completo SARA (2026-01-28 16:40 CST):

**Teléfonos verificados:**
- Lead: 5610016226 (Roberto García)
- Vendedor: 5212224558475 (Vendedor Test)
- CEO: 5214922019052 (Oscar Castelo)

| Fase | Sistema | Tests | Estado |
|------|---------|-------|--------|
| 1 | Lead Journey | Monte Verde, Crédito, GPS | ✅ DELIVERED |
| 2 | Vendedor Commands | mis leads, citas, briefing, hot | ✅ DELIVERED |
| 3 | CEO Commands | equipo, leads, conexiones | ✅ DELIVERED |
| 4 | IA Conversacional | Precios (~6s), ubicación (~5s), crédito (~4s) | ✅ |
| 5 | APIs | Leads (35), Team (20), Health, Veo3, CRM | ✅ |
| 6 | Ventana 24h | 6 abiertas, 12 cerradas, 15 pending | ✅ |
| 7 | Supabase | Roberto García score=61, status=scheduled | ✅ |

**Métricas del día:**
- Leads hoy: 24
- Citas hoy: 3
- Team activos: 18
- Desarrollos: 36

**URLs de producción:**
- Backend: https://sara-backend.edson-633.workers.dev
- CRM: https://sara-crm-new.vercel.app
- Videos: https://sara-videos.onrender.com

### Flujos Adicionales Probados (2026-01-28 17:00 CST):

| Flujo | Tests | Estado |
|-------|-------|--------|
| Bridge (chat directo) | Activar, enviar, cerrar | ✅ |
| Crédito hipotecario | INFONAVIT, ingresos | ✅ |
| Broadcast | Ayuda, segmentos | ✅ |
| Post-visita y encuestas | Encuestas OK | ✅ |
| Remarketing y reactivación | Ambos ejecutados | ✅ |
| CRONs | Simulación OK | ✅ |
| Cumpleaños y follow-ups | Ejecutados | ✅ |
| Google Calendar | Crear/borrar evento | ✅ |
| Veo3 video | API OK (rate limit) | ⚠️ |

### Seguridad - Endpoints Protegidos (2026-01-28 17:00 CST):

**TODOS los `/test-*` ahora requieren API key:**
```
?api_key=<API_SECRET>
# o header
Authorization: Bearer <API_SECRET>
```

**Endpoints públicos (sin auth):**
- `/webhook` - Meta webhook
- `/health` - Health check
- `/status` - Status dashboard
- `/analytics` - Analytics dashboard
- `/` - Root

**Antes (vulnerables):**
- `/test-ventana-24h` - Exponía nombres y teléfonos ❌
- `/test-envio-7pm` - Exponía nombres y teléfonos ❌

**Ahora (protegidos):**
- Todos los `/test-*` requieren API key ✅

### 2026-01-29

**Refactoring Masivo - Modularización de index.ts**

El archivo `index.ts` fue refactorizado de ~22,700 líneas a ~14,300 líneas (-37%) extrayendo funciones CRON a módulos separados:

| Fase | Módulo Creado | Funciones Extraídas |
|------|---------------|---------------------|
| 1 | `crons/reports.ts` | Reportes diarios, semanales, mensuales |
| 2 | `crons/briefings.ts` | Briefings matutinos, logEvento |
| 2 | `crons/alerts.ts` | Alertas leads fríos, calientes, cumpleaños |
| 3 | `crons/followups.ts` | Follow-ups, nurturing, broadcasts |
| 4 | `crons/leadScoring.ts` | Scoring, señales calientes, objeciones |
| 4 | `crons/nurturing.ts` | Recuperación crédito, NPS, referidos |
| 5 | `crons/maintenance.ts` | Bridges, leads estancados, aniversarios |
| 6 | `crons/videos.ts` | Videos Veo 3 personalizados |
| 7 | `crons/dashboard.ts` | Status, analytics, health, backup |

**Beneficios:**
- Código más mantenible y organizado
- Imports claros entre módulos
- Más fácil de testear y debuggear
- 260 tests siguen pasando ✅

**Nuevas Funcionalidades de Inteligencia de Negocio:**

| Funcionalidad | Servicio | Comandos CEO | Endpoints API |
|---------------|----------|--------------|---------------|
| Pipeline de Ventas | `pipelineService.ts` | `pipeline`, `funnel` | `/api/pipeline/*` |
| Calculadora Hipotecaria | `financingCalculatorService.ts` | `calcular [precio]`, `bancos` | `/api/financing/*` |
| Comparador Propiedades | `propertyComparatorService.ts` | `comparar [A] vs [B]` | `/api/compare/*` |
| Probabilidad de Cierre | `closeProbabilityService.ts` | `probabilidad`, `pronostico` | `/api/probability/*` |
| Gestión de Visitas | `visitManagementService.ts` | `visitas` | `/api/visits/*` |

**Características principales:**
- **Pipeline:** Forecast mensual, leads at-risk, conversión por etapa, métricas por vendedor
- **Financiamiento:** Comparativa 8 bancos (BBVA, Banorte, Santander, HSBC, Scotiabank, INFONAVIT, FOVISSSTE, Cofinavit)
- **Comparador:** Comparar desarrollos, precio/m², score automático, recomendaciones
- **Probabilidad:** Cálculo ML-like con factores positivos/negativos, confianza, fechas esperadas
- **Visitas:** Analytics de completación, no-shows, conversión, métricas por desarrollo y vendedor

### 2026-01-29 (Sesión 3) - Sistema de Ofertas/Cotizaciones

**Nueva funcionalidad completa de ofertas vía WhatsApp:**

| Comando Vendedor | Descripción |
|------------------|-------------|
| `cotizar [nombre] [precio]` | Crear oferta (soporta nombres con espacios: "cotizar Roberto García 2500000") |
| `ofertas` / `mis ofertas` | Ver ofertas activas del vendedor |
| `oferta [nombre]` | Ver detalle de oferta de un lead |
| `enviar oferta [nombre]` | Enviar oferta al cliente vía WhatsApp |
| `oferta aceptada [nombre]` | Marcar oferta como aceptada |
| `oferta rechazada [nombre] [razón]` | Marcar oferta como rechazada |

**Respuestas automáticas a ofertas (leadMessageService):**

Cuando un lead responde a una oferta enviada (últimas 48h), SARA detecta automáticamente:

| Respuesta Lead | Nuevo Status | Acción |
|----------------|--------------|--------|
| "Si", "me interesa", "quiero" | `negotiating` | Notifica vendedor 🔥 LEAD INTERESADO |
| "No", "muy caro", "paso" | `rejected` | Notifica vendedor ❌ + pregunta razón al lead |
| "Cuánto enganche?", "requisitos" | `negotiating` | Notifica vendedor ❓ con la pregunta |
| Cualquier otra respuesta | `viewed` | Notifica vendedor 💬 |

**Archivos modificados:**
- `src/services/vendorCommandsService.ts` - Comandos de ofertas (regex multi-palabra)
- `src/services/leadMessageService.ts` - Detección de respuestas a ofertas
- `src/handlers/whatsapp.ts` - Handlers de comandos de ofertas

**SQL para crear tabla:**
```sql
-- Ejecutar offers_table.sql en Supabase Dashboard → SQL Editor
```

**Estados del ciclo de vida de oferta:**
```
draft → sent → viewed → negotiating → accepted → reserved → contracted
                    ↘ rejected
                    ↘ expired
                    ↘ cancelled
```

### 2026-01-29 (Sesión 4) - Panel Coordinador y APIs

**Nuevos endpoints para CRM:**

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/appointments` | GET | Listar citas con filtros |
| `/api/properties` | GET | Listar propiedades (ahora público) |

**Filtros de `/api/appointments`:**
- `?start_date=2026-01-29` - Desde fecha
- `?end_date=2026-02-05` - Hasta fecha
- `?vendor_id=xxx` - Por vendedor

**Panel Coordinador verificado:**
- ✅ Crear leads desde panel
- ✅ Asignar a vendedor automáticamente
- ✅ Ver disponibilidad del equipo
- ✅ Gestión de citas (crear, cambiar, cancelar)
- ✅ Reasignar leads
- ✅ Agregar notas

---

## ⚠️ TELÉFONOS DE PRUEBA (CRÍTICO)

**SOLO usar estos dos teléfonos para pruebas:**

| Teléfono | Uso |
|----------|-----|
| **5610016226** | Lead de prueba (Roberto García) |
| **5212224558475** | Vendedor Test |

**NUNCA usar el teléfono de Oscar (5214922019052) para pruebas.**


### 2026-01-29 (Sesión 5) - QA Completo Meta + Marketing

**Conexión Meta verificada:**
- ✅ Webhook WhatsApp: `/webhook/meta` (token: `sara_verify_token`)
- ✅ Webhook Facebook Leads: `/webhook/facebook-leads` (token: `sara_fb_leads_token`)
- ✅ META_ACCESS_TOKEN configurado
- ✅ META_PHONE_NUMBER_ID configurado
- ✅ META_WHATSAPP_BUSINESS_ID configurado

**Flujo completo probado:**
```
Lead escribe WhatsApp → SARA responde → Lead en CRM → Vendedor notificado ✅
```

**Panel Marketing CRM probado:**
- ✅ Dashboard con KPIs (ROI 4500%, CPL $1,351)
- ✅ Funnel de conversión
- ✅ Performance por fuente
- ✅ AI Insights
- ✅ Exportar PDF

**APIs Marketing probadas:**
- ✅ `/api/attribution/track` - Tracking UTM
- ✅ `/api/tracking/links` - Links rastreables
- ✅ `/api/reports/weekly` - Reporte semanal
- ✅ `/api/reports/weekly/html` - HTML para PDF

**Comandos WhatsApp Marketing:**
- ✅ campañas, metricas, segmentos, broadcast
- ✅ enviar a [segmento]: [mensaje]
