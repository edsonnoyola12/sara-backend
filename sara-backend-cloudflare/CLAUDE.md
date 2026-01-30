# SARA CRM - Memoria Principal para Claude Code

> **IMPORTANTE**: Este archivo se carga automáticamente en cada sesión.
> Última actualización: 2026-01-30

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

# 2. Verifica tests (OBLIGATORIO - 351 tests)
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
| `src/crons/nurturing.ts` | ~1200 | Recuperación crédito, NPS, referidos, post-compra |
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

### 6. Flujos Post-Compra (Automáticos)

**Timeline del Customer Journey Post-Compra:**
```
 COMPRA                    ENTREGA                         1 AÑO
   │                          │                              │
   ▼                          ▼                              ▼
═══●══════════════════════════●══════════════════════════════●═══
   │                          │                              │
   │  ┌─────────────────────┐ │  ┌─────────────────────┐    │
   │  │ 7-30 días          │ │  │ 3-7 días            │    │
   │  │ 📊 NPS (0-10)      │ │  │ 🔑 Post-entrega     │    │
   │  │ Viernes 10am       │ │  │ Lun/Jue 10am        │    │
   │  └─────────────────────┘ │  └─────────────────────┘    │
   │                          │                              │
   │  ┌─────────────────────┐ │  ┌─────────────────────┐    │
   │  │ 30-90 días         │ │  │ 3-6 meses           │    │
   │  │ 🤝 Referidos       │ │  │ 🏡 Satisfacción     │    │
   │  │ Miércoles 11am     │ │  │ Martes 11am         │    │
   │  └─────────────────────┘ │  └─────────────────────┘    │
   │                          │                              │
   │                          │  ┌─────────────────────┐    │
   │                          │  │ ~1 año              │    │
   │                          │  │ 🔧 Mantenimiento    │    │
   │                          │  │ Sábado 10am         │    │
   │                          │  └─────────────────────┘    │
   │                          │                              │
   │                          │  ┌─────────────────────┐    │
   │                          │  │ Cada año            │    │
   │                          │  │ 🎉 Aniversario      │    │
   │                          │  │ 9am L-V             │    │
   │                          │  └─────────────────────┘    │
   │                          │                              │
sold/closed               delivered                      +1 año
```

**Calendario de CRONs Post-Compra:**

| Día | Hora | Flujo | Trigger |
|-----|------|-------|---------|
| Lunes | 10am | 🔑 Seguimiento post-entrega | 3-7 días post-delivered |
| Martes | 11am | 🏡 Encuesta satisfacción casa | 3-6 meses post-delivered |
| Miércoles | 11am | 🤝 Solicitud de referidos | 30-90 días post-sold |
| Jueves | 10am | 🔑 Seguimiento post-entrega | 3-7 días post-delivered |
| Viernes | 10am | 📊 Encuestas NPS | 7-30 días post-visita/compra |
| Sábado | 10am | 🔧 Check-in mantenimiento | ~1 año post-delivered |
| L-V | 9am | 🎉 Aniversarios | Cada año |

**Funciones en `src/crons/nurturing.ts`:**
- `seguimientoPostEntrega()` - Verifica llaves, escrituras, servicios
- `encuestaSatisfaccionCasa()` - Calificación 1-4 de satisfacción
- `checkInMantenimiento()` - Recordatorio anual de mantenimiento
- `solicitarReferidos()` - Pide referidos a clientes satisfechos
- `enviarEncuestaNPS()` - Net Promoter Score 0-10

**Procesamiento de respuestas:**
- `procesarRespuestaEntrega()` - Detecta problemas (llaves, escrituras, servicios)
- `procesarRespuestaSatisfaccionCasa()` - Clasifica 1=Excelente, 2=Buena, 3=Regular, 4=Mala
- `procesarRespuestaMantenimiento()` - Conecta con proveedores si necesita
- `procesarRespuestaNPS()` - Clasifica: 0-6=Detractor, 7-8=Pasivo, 9-10=Promotor

**Endpoints manuales:**
- `/run-post-entrega` - Ejecutar seguimiento post-entrega
- `/run-satisfaccion-casa` - Ejecutar encuesta satisfacción
- `/run-mantenimiento` - Ejecutar check-in mantenimiento
- `/run-referidos` - Ejecutar solicitud de referidos
- `/run-nps` - Ejecutar encuestas NPS

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
- 304 tests siguen pasando ✅

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

### 2026-01-29 (Sesión 6) - QA Exhaustivo Respuestas SARA a Leads

**42 tests ejecutados - TODOS PASARON**

| Categoría | Tests | Estado |
|-----------|-------|--------|
| Info desarrollos (Monte Verde, Alpes, Miravalle, etc.) | 5 | ✅ |
| Solicitud recursos (GPS/video/brochure) | 6 | ✅ |
| Precios y financiamiento | 3 | ✅ |
| Respuestas negativas ("no me interesa", "muy caro") | 5 | ✅ |
| Crédito/INFONAVIT | 3 | ✅ |
| Citas y visitas | 3 | ✅ |
| Saludos simples (hola, ok, 👍) | 4 | ✅ |
| Casos especiales (typos, spam, competencia) | 10 | ✅ |
| Flujo real WhatsApp | 3 | ✅ |

**Respuestas verificadas:**
- ✅ Precios correctos de 36 propiedades
- ✅ Sinónimos: Citadella del Nogal = Villa Campelo/Galiano
- ✅ Errores ortográficos: "informasion monteverde" → entiende
- ✅ NO inventa tasas de interés → redirige a bancos
- ✅ Objeciones de precio → ofrece opciones económicas desde $1.5M
- ✅ Objeciones de ubicación → pregunta zona de trabajo
- ✅ Menciones de competencia → no critica, ofrece valor
- ✅ "Ya compré en otro lado" → felicita, ofrece referidos
- ✅ Respuestas negativas → respeta decisión, deja puerta abierta
- ✅ Urgencia de compra → detecta y prioriza
- ✅ Preguntas fuera de tema → responde + redirige a inmobiliaria
- ✅ Mensajes spam/gibberish → responde amablemente
- ✅ GPS, video, brochure → se envían correctamente

**Flujo real verificado (teléfono 5610016226):**
- ✅ Lead pregunta por Monte Verde → SARA responde con info
- ✅ Lead pide ubicación → GPS enviado
- ✅ Mensajes llegan a WhatsApp correctamente

---

## ✅ CHECKLIST COMPLETO DE FUNCIONALIDADES

### 🔗 CONEXIONES E INTEGRACIONES

| Integración | Estado | Descripción |
|-------------|--------|-------------|
| Meta WhatsApp API | ✅ | Webhook `/webhook/meta` |
| Facebook Lead Ads | ✅ | Webhook `/webhook/facebook-leads` |
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

### 📱 COMANDOS WHATSAPP (Todos verificados 2026-01-29)

**CEO:** leads, briefing, equipo, ventas, pipeline, probabilidad, visitas, alertas, mercado, clv, calcular, bancos, comparar, bridge, broadcast, adelante/atrás, nota, ofertas, brochure/ubicación/video ✅

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
| Reportes | `/api/reports/*` |

### ⏰ CRONs AUTOMATIZADOS

| CRON | Frecuencia | Estado |
|------|------------|--------|
| Leads sin asignar | Cada 2 min | ✅ |
| Follow-ups | 2 PM L-V | ✅ |
| Briefing matutino | 8 AM | ✅ |
| Reporte 7 PM | 7 PM | ✅ |
| Alertas/Cumpleaños | Diario | ✅ |
| Scoring leads | Diario | ✅ |
| NPS/Encuestas | Viernes 10am | ✅ |
| Seguimiento post-entrega | Lun/Jue 10am | ✅ |
| Satisfacción casa | Martes 11am | ✅ |
| Check-in mantenimiento | Sábado 10am | ✅ |
| Referidos | Miércoles 11am | ✅ |

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
| Unit tests | 260 | ✅ |
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

**Sistema 100% operativo - Última verificación: 2026-01-29**

### 2026-01-29 (Sesión 7) - Fix Comportamiento de Ventas de SARA

**Problema identificado:**
SARA actuaba como "asistente" en lugar de "vendedora experta":
- Decía "Le aviso a Vendedor Test para que te contacte" en lugar de cerrar la cita
- Usaba frases pasivas: "Sin problema", "Entendido", "Ok"
- "quiero ver las casas" activaba tour virtual (matterport) en lugar de cita física

**Correcciones aplicadas:**

| Archivo | Cambio |
|---------|--------|
| `aiConversationService.ts` | Regla crítica: "QUIERE VER = AGENDAR CITA" |
| `aiConversationService.ts` | Frases prohibidas: "Sin problema", "Entendido", "Le aviso a vendedor" |
| `aiConversationService.ts` | Corrección post-Claude: fuerza cierre de cita si cliente muestra interés |
| `leadMessageService.ts` | Respuestas a ofertas ahora cierran con "¿sábado o domingo?" |
| `leadMessageService.ts` | Fix detección negativo vs positivo ("no me interesa" antes detectaba "me interesa") |
| `index.ts` | Endpoint de prueba corregido: Zacatecas (no Querétaro) |

**Lógica de corrección automática (aiConversationService.ts:1942-1990):**
```
Si cliente dice: "quiero ver", "me interesa", "sí quiero", "claro", "dale", etc.
→ intent = "solicitar_cita"
→ contactar_vendedor = false
→ response = "¿Te funciona el sábado o el domingo?"
```

**Detección de respuestas a ofertas (leadMessageService.ts:220-222):**
```typescript
// ANTES (bug): "no me interesa" detectaba "me interesa" como positivo
const esPositivo = respuestasPositivas.some(r => mensajeLower.includes(r));
const esNegativo = respuestasNegativas.some(r => mensajeLower.includes(r));

// AHORA (fix): negativo se evalúa primero
const esNegativo = respuestasNegativas.some(r => mensajeLower.includes(r));
const esPositivo = !esNegativo && respuestasPositivas.some(r => mensajeLower.includes(r));
```

**Tests de flujo verificados:**

| Mensaje Lead | Antes | Ahora |
|--------------|-------|-------|
| "si quiero ver las casas" | "Le aviso a Vendedor Test" | "¿Sábado o domingo?" ✅ |
| "no gracias no me interesa" | "🔥 LEAD INTERESADO" | "¿Qué te hizo dudar?" ✅ |
| "ok lo voy a pensar" | "Sin problema" | Ofrece valor + pregunta ✅ |
| "El tamaño" (objeción) | Respuesta genérica | Opciones específicas (60-115m²) ✅ |

**Commits:**
- `bb3d7229` - fix: detectar respuestas negativas antes que positivas en ofertas
- `0ec6912d` - fix: corregir respuestas hardcodeadas en leadMessageService
- `d51a44eb` - fix: SARA cierra citas directamente en lugar de pasar a vendedor

---

### 2026-01-29 (Sesión 7 - Parte 2) - Fix Citadella del Nogal

**Problema detectado en análisis de conversaciones:**
SARA decía incorrectamente "El Nogal no lo tenemos disponible" cuando SÍ lo tenemos.

**Causa:** Claude ignoraba las instrucciones del prompt sobre sinónimos.

**Corrección aplicada (aiConversationService.ts):**

1. **Instrucciones reforzadas** con frases prohibidas explícitas:
```
🚫 NUNCA DIGAS:
- "Citadella del Nogal no es uno de nuestros desarrollos" ← FALSO
- "El Nogal no lo tenemos disponible" ← FALSO
```

2. **Corrección automática post-Claude:**
```typescript
if (preguntaPorNogal && dijoNoTenemos) {
  parsed.response = "¡Excelente elección! Citadella del Nogal es nuestro desarrollo...
    Villa Campelo - $450,000 / Villa Galiano - $550,000";
}
```

3. **Reemplazo de nombres:**
```typescript
"visitar *El Nogal*" → "visitar *Villa Campelo o Villa Galiano*"
```

**Tests verificados:**

| Mensaje | Antes | Ahora |
|---------|-------|-------|
| "busco terrenos en El Nogal" | "no lo tenemos disponible" | "Tengo terrenos en Villa Campelo y Villa Galiano" ✅ |
| "Me interesa Citadella del Nogal" | "no es de nuestros desarrollos" | "Tenemos Villa Campelo ($450k) y Villa Galiano ($550k)" ✅ |

**Commit:** `c3d9defe` - fix: corregir respuestas de Citadella del Nogal / El Nogal

---

### 2026-01-29 (Sesión 7 - Parte 3) - Fix "Ya compré en otro lado"

**Problema detectado en pruebas edge-case:**
Cuando cliente dice "ya compré en otro lado", SARA seguía indagando en lugar de felicitar.

**Antes:** "¿Qué tipo de propiedad compraste? Me da curiosidad..."
**Ahora:** "¡Muchas felicidades por tu nueva casa! 🎉"

**Corrección aplicada:**

1. **Instrucciones en prompt (aiConversationService.ts):**
```
🏡 SI DICE "YA COMPRÉ EN OTRO LADO":
- Felicítalo genuinamente
- NO indagues qué compró
- Ofrece atender referidos
- Cierra amablemente
```

2. **Corrección automática post-Claude:**
```typescript
if (yaComproOtroLado && sigueIndagando) {
  response = "¡Muchas felicidades por tu nueva casa! 🎉...
    Si algún familiar busca casa, con gusto lo atiendo.";
}
```

3. **Endpoint de prueba también actualizado (index.ts)**

**Tests verificados:**

| Mensaje | Antes | Ahora |
|---------|-------|-------|
| "ya compré en otro lado" | "¿Qué tipo compraste?" | "¡Felicidades! 🎉" ✅ |
| "ya tengo casa gracias" | Seguía vendiendo | "¡Felicidades! Si algún familiar..." ✅ |

**Commit:** `18b3038f` - fix: felicitar cuando cliente dice 'ya compré en otro lado'

---

### 2026-01-29 (Sesión 7 - Parte 4) - Fixes Edge-Cases Adicionales

**20 edge-cases probados, 5 problemas identificados y corregidos:**

| Problema | Antes | Ahora |
|----------|-------|-------|
| **RENTA** | "Sí, tenemos casas en renta" | "Solo VENDEMOS, no rentamos" ✅ |
| **PERSONA REAL** | "Soy asesora real" | "Soy SARA, asistente virtual 🤖" ✅ |
| **URGENCIA** | Respuesta genérica | Lista entrega inmediata (Monte Verde, Los Encinos, Andes) ✅ |
| **ESCUELAS** | Respuesta vaga | Respuesta informativa + cierre a casas ✅ |
| **ENGLISH** | Respondía en español | Responde en inglés con precios USD ✅ |

**Correcciones aplicadas:**

1. **RENTA (aiConversationService.ts + index.ts):**
```
⚠️ SOLO VENDEMOS, NO RENTAMOS:
Si preguntan "¿tienen casas en renta?" → "En Santa Rita solo vendemos casas..."
```
Post-procesamiento: Si Claude dice "sí tenemos rentas" → corregir automáticamente.

2. **PERSONA REAL (aiConversationService.ts + index.ts):**
```
🚫 NUNCA digas "soy una persona real" o "asesora real" - ERES UNA IA
✅ RESPUESTA: "Soy SARA, asistente virtual 🤖 Pero con gusto te conecto con un asesor humano."
```

3. **URGENCIA (aiConversationService.ts + index.ts):**
```
📌 "ME URGE MUDARME" / "NECESITO CASA PRONTO":
"¡Perfecto, tengo opciones de ENTREGA INMEDIATA! 🏠
• Monte Verde - Desde $1.5M
• Los Encinos - Desde $2.9M
• Andes - Desde $1.5M"
```

4. **ENGLISH (index.ts):**
```
🌐 IDIOMA:
- Si el cliente escribe en INGLÉS → Responde COMPLETAMENTE en inglés
- Muestra precios en MXN y USD (1 USD ≈ 17 MXN)
```
Post-procesamiento inteligente: Detecta mensaje en inglés, si Claude respondió en español → respuesta en inglés con precios en ambas monedas.

**Archivos modificados:**
- `src/services/aiConversationService.ts` - Instrucciones de prompt + post-procesamiento
- `src/index.ts` - Endpoint de prueba con mismas correcciones

**Tests verificados:**

| Mensaje | Respuesta |
|---------|-----------|
| "tienen casas en renta" | "solo vendemos casas, no manejamos rentas" ✅ |
| "quiero hablar con persona real" | "Soy SARA, asistente virtual 🤖" ✅ |
| "me urge mudarme este mes" | "ENTREGA INMEDIATA: Monte Verde, Los Encinos, Andes" ✅ |
| "I want to buy a house" | "Hi there! Welcome to Grupo Santa Rita!" ✅ |
| "What is the price of Monte Verde" | "$1,500,000 MXN (~$88,000 USD)" ✅ |

**Deploy:** Version ID `934ff302-8954-4bcc-9a98-b10e46e44a81`

---

### 2026-01-29 (Sesión 7 - Parte 5) - Respetar Peticiones de No Contacto

**Problema detectado en edge-case testing:**
SARA ignoraba peticiones de no contacto y seguía vendiendo.

**Casos corregidos:**

| Mensaje | Antes | Ahora |
|---------|-------|-------|
| "ya no me escribas" | Seguía vendiendo | "Respeto tu decisión..." ✅ |
| "dejame en paz" | Seguía preguntando | "Respeto tu decisión..." ✅ |
| "no me contactes" | Insistía | "Respeto tu decisión..." ✅ |
| "numero equivocado" | Intentaba vender | "Disculpa la confusión..." ✅ |

**Correcciones aplicadas:**

1. **Instrucciones en prompt:**
```
⚠️ CRÍTICO: Si el cliente dice "ya no me escribas", "dejame en paz", "stop":
📝 RESPUESTA: "Entendido, respeto tu decisión. Si en el futuro te interesa buscar casa, aquí estaré. ¡Excelente día! 👋"
```

2. **Post-procesamiento:**
- Detecta frases de no contacto
- Si SARA sigue vendiendo → fuerza respuesta de respeto
- Marca intent como "despedida"

**25+ edge-cases probados exitosamente:**
- No contacto, errores, competencia, objeciones, ubicación
- Especificaciones, financiamiento, mascotas, terrenos
- Local comercial, personalización, idioma inglés, USA

**Commit:** `5f6aca3e`
**Deploy:** Version ID `c24bd307-931d-47e1-9d8b-e5a25c31941a`

---

### 2026-01-29 (Sesión 7 - Parte 6) - Fix Alberca (SOLO Andes)

**Problema detectado en revisión de respuestas:**
SARA decía incorrectamente que Distrito Falco o Miravalle tenían alberca.

**Realidad:** SOLO **Priv. Andes** tiene ALBERCA.

| Mensaje | Antes | Ahora |
|---------|-------|-------|
| "tienen alberca" | "No incluyen alberca" ❌ | "Sí, Priv. Andes tiene alberca" ✅ |
| "cual tiene alberca" | "Distrito Falco tiene alberca" ❌ | "SOLO Priv. Andes" ✅ |

**Correcciones aplicadas:**

1. **Instrucciones reforzadas en prompt:**
```
⚠️⚠️⚠️ ALBERCA - CRÍTICO ⚠️⚠️⚠️
🏊 SOLO **Priv. Andes** tiene ALBERCA
🚫 Distrito Falco NO tiene alberca
🚫 Monte Verde NO tiene alberca
🚫 Los Encinos NO tiene alberca
🚫 Miravalle NO tiene alberca
```

2. **Post-procesamiento:**
- Detecta respuestas incorrectas sobre alberca
- Si dice Falco/Miravalle tienen alberca → corrige a Andes
- Respuesta estandarizada con precios de Andes

**Respuesta correcta:**
```
¡Sí tenemos desarrollo con alberca! 🏊
Priv. Andes es nuestro único fraccionamiento con ALBERCA:
• Laurel - $1,514,957 (2 rec)
• Lavanda - $2,699,071 (3 rec, vestidor)
```

**30+ edge-cases verificados en esta sesión**

**Commit:** `aa953096`
**Deploy:** Version ID `60e1fc3b-78ae-4439-8656-c6a8a6f6c8ef`

---

### 2026-01-29 (Sesión 7 - Parte 7) - Manejo de Mensajes Multimedia

**Problema detectado:**
SARA no manejaba correctamente mensajes que no fueran texto:
- Audios/notas de voz → se ignoraban
- Stickers/GIFs → se ignoraban
- Ubicación → se ignoraba
- Emojis solos → respuesta genérica
- Videos → se ignoraban
- Contactos compartidos → se ignoraban
- Reacciones → se ignoraban

**Correcciones implementadas en `src/index.ts` (webhook handler):**

| Tipo de mensaje | Antes | Ahora |
|----------------|-------|-------|
| **Audio/Voz** 🎤 | Ignorado | Transcribe con Whisper + responde |
| **Sticker** 😄 | Ignorado | "¡Me encanta tu sticker! ¿Buscas casa?" |
| **Ubicación** 📍 | Ignorado | Info de zonas + pregunta qué les queda cerca |
| **Video** 🎬 | Ignorado | "¡Gracias! Prefiero texto ¿Qué necesitas?" |
| **Contacto** 👤 | Ignorado | "¿Le escribo o le das mi número?" |
| **Reacción** 👍 | Ignorado | Positivas: log silencioso. Negativas: no responder |
| **Emoji solo** | IA genérica | Respuesta específica por tipo de emoji |

**Manejo de emojis solos:**

| Emoji | Interpretación | Respuesta |
|-------|---------------|-----------|
| 👍 👌 ✅ ❤️ 😊 | Positivo | "¿Te gustaría agendar visita?" |
| 👎 😢 😔 | Negativo | "¿Hay algo que te preocupe?" |
| 🤔 😐 | Neutral | "¿Tienes alguna duda?" |
| 🏠 🏡 | Casa | "¿De 2 o 3 recámaras?" |
| 💰 💵 | Dinero | "Hablemos de números: desde $1.5M" |

**Audios/Notas de voz:**

```
1. Recibe audio de WhatsApp
2. Descarga con Meta API
3. Transcribe con OpenAI Whisper (si OPENAI_API_KEY existe)
4. Procesa texto transcrito como mensaje normal
5. Si falla → "¿Podrías escribirme tu mensaje?"
```

**Archivos modificados:**
- `src/index.ts` - Webhook handler con manejo de todos los tipos de mensaje

**Follow-ups automáticos (ya existían):**

| Tiempo sin respuesta | Acción |
|---------------------|--------|
| 24h | Alerta al vendedor |
| 48h | Re-engagement alert |
| 3 días | Follow-up paso 1 |
| 7 días | Follow-up paso 2 |
| 14 días | Follow-up paso 3 |
| 21+ días | Lead marcado FRÍO |

**Commit:** `e2d445b3`
**Deploy:** Version ID `92e10885-18e7-4fbe-ba3f-c524b84e13fa`

---

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

SARA ya maneja correctamente preguntas que no tienen que ver con inmobiliaria:

| Pregunta | Respuesta SARA |
|----------|----------------|
| "venden hamburguesas" | "vendemos casas, no hamburguesas" ✅ |
| "quiero una pizza" | "te equivocaste de número" ✅ |
| "venden medicinas" | "vendemos casas, no medicamentos" ✅ |
| "busco carro usado" | "nos especializamos en casas" ✅ |
| "cuéntame un chisme" | "¡Hay casas desde $1.5M!" 😄 ✅ |
| "eres tonta" (insulto) | Ignora insulto, sigue profesional ✅ |
| "ayuda con mi tarea" | "¿Tus papás buscan casa?" ✅ |

**Comportamiento verificado:**
1. ✅ Reconoce que es pregunta fuera de tema
2. ✅ Aclara que es SARA de Grupo Santa Rita (inmobiliaria)
3. ✅ No inventa - no pretende vender lo que no tiene
4. ✅ Redirige amablemente hacia casas
5. ✅ Maneja insultos con profesionalismo

---

### 2026-01-29 (Sesión 7 - Parte 9) - Fix Nombres Alucinados por Claude

**Problema detectado en análisis de conversaciones reales:**
Claude inventaba nombres cuando el lead no tenía nombre registrado en la base de datos.

**Caso real:** Oscar escribió a SARA y Claude le respondió "¡Hola de nuevo María!" - María nunca existió.

**Corrección aplicada (aiConversationService.ts):**

1. **Lista expandida de nombres comunes (46 nombres):**
```typescript
const nombresHallucinated = ['Salma', 'María', 'Maria', 'Juan', 'Pedro', 'Ana',
  'Luis', 'Carlos', 'Carmen', 'José', 'Jose', 'Rosa', 'Miguel', 'Laura',
  'Antonio', 'Sofía', 'Sofia', 'Diana', 'Jorge', 'Patricia', 'Roberto',
  'Andrea', 'Fernando', 'Manuel', 'Isabel', 'Francisco', 'Alejandro',
  'Ricardo', 'Gabriela', 'Daniel', 'Eduardo', 'Martha', 'Marta',
  'Guadalupe', 'Lupita', 'Javier', 'Sergio', 'Adriana', 'Claudia',
  'Monica', 'Mónica', 'Leticia', 'Lety', 'Teresa', 'Tere', 'Elena', 'Silvia'];
```

2. **Dos casos de manejo:**

| Caso | Condición | Acción |
|------|-----------|--------|
| **1** | lead.name existe | Reemplazar nombre falso → nombre real |
| **2** | lead.name NO existe | ELIMINAR nombre inventado |

3. **Patrones de eliminación:**
```typescript
// "¡Hola de nuevo María!" → "¡Hola de nuevo!"
// "Perfecto María," → "Perfecto,"
// "Listo María " → "Listo "
```

**Ejemplo de corrección:**

| Antes | Ahora |
|-------|-------|
| "¡Hola de nuevo María!" | "¡Hola de nuevo!" |
| "Perfecto María, te agendo" | "Perfecto, te agendo" |
| "Listo María!" | "¡Listo!" |

**Commit:** `8d9b2d92`
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

### 2026-01-30 (Sesión 8) - Optimización de Costos

**Análisis del prompt de IA:**
- Prompt original: 75,177 caracteres (~18,794 tokens)
- Prompt optimizado: 68,977 caracteres (~17,244 tokens)
- **Ahorro: 8% (~1,550 tokens por mensaje)**

**Cambios realizados:**
1. Eliminadas 165 líneas decorativas (━━━)
2. Reducidos emojis triples a simples (⚠️⚠️⚠️ → ⚠️)
3. Mantenida toda la funcionalidad crítica

**Impacto en costos:**
| Métrica | Antes | Después |
|---------|-------|---------|
| Tokens/mensaje | ~18,800 | ~17,250 |
| Costo/mensaje | $0.056 | $0.051 |
| Costo mensual (100 msgs/día) | ~$170 | ~$155 |
| **Ahorro mensual** | - | **~$15** |

**Verificación:**
- ✅ 304 tests pasando
- ✅ Saludos funcionan correctamente
- ✅ Objeciones manejadas
- ✅ Citadella del Nogal = Villa Campelo/Galiano
- ✅ Alberca solo en Andes

**Commit:** `2cb10ba5`
**Deploy:** Version ID `f0ea754f-7c70-460a-9019-46535db0a4eb`

---

### 2026-01-30 (Sesión 8 - Parte 2) - Documentación de APIs

**Archivo actualizado:** `docs/api-reference.md`

**Secciones agregadas:**
1. Índice con 13 secciones navegables
2. Autenticación detallada (header vs query param)
3. Endpoints públicos (no requieren auth)
4. Leads CRUD con ejemplos de request/response
5. Citas (Appointments) con filtros
6. Créditos Hipotecarios
7. Dashboard y Reportes
8. Webhooks (Meta, Facebook, Google Calendar)
9. Calendario/Eventos
10. Templates WhatsApp
11. Testing y Debug (26 endpoints documentados)
12. Sistema (emergency-stop, broadcasts)
13. Servicios Internos (MetaWhatsApp, Supabase, AI, Bridge)

**Endpoints documentados:** 50+

**Formato:** Markdown con ejemplos de request/response JSON

**Commit:** `3817e382`

---

### 2026-01-30 (Sesión 8 - Parte 3) - QA Conversaciones + Monitoreo + Optimización + Schemas

**1. QA de Conversaciones Reales (12/12 tests)**

| Test | Resultado |
|------|-----------|
| Saludo | ✅ Pregunta 2 o 3 recámaras |
| Monte Verde | ✅ Lista 5 modelos con precios |
| Alberca | ✅ SOLO Priv. Andes |
| Citadella del Nogal | ✅ Villa Campelo + Galiano |
| Renta | ✅ "Solo vendemos, no rentamos" |
| No contacto | ✅ Respeta decisión |
| Objeción precio | ✅ Ofrece desde $1.5M |
| English | ✅ Responde en inglés + USD |
| Ya compré | ✅ Felicita + referidos |
| Persona real | ✅ "Soy SARA" |
| INFONAVIT | ✅ Pregunta precalificación |
| Fuera tema | ✅ Redirige a casas |

**2. Monitoreo de Producción**

| Métrica | Valor |
|---------|-------|
| Status | ✅ healthy |
| Supabase | ✅ ok (38 leads) |
| Team members | 20 (18 activos) |
| Vendedores | 9 |
| Coordinadores | 8 |

**3. Optimización Adicional del Prompt**

| Métrica | Antes | Ahora |
|---------|-------|-------|
| Prompt (chars) | ~68,977 | ~68,150 |
| Ahorro adicional | - | ~827 chars |

**Cambio:** Eliminadas 18 líneas de objeciones duplicadas

**Commit:** `d6f31ac2`
**Deploy:** Version ID `f1edae6a-63b1-43e7-8bce-faf3f168367d`

**4. Documentación de Schemas Supabase**

**Archivo creado:** `docs/database-schema.md`

**Tablas documentadas:**
1. `leads` - 20+ campos, estados del funnel
2. `team_members` - roles, pending messages
3. `appointments` - citas con Google Calendar
4. `properties` - catálogo de 36 propiedades
5. `mortgage_applications` - créditos hipotecarios
6. `pending_videos` - videos Veo 3
7. `offers` - ciclo de vida de ofertas
8. `surveys` - encuestas post-visita
9. `system_config` - configuración
10. Tablas secundarias (activities, followups, goals, campaigns)

**Incluye:**
- Diagramas de estados (lead funnel, ofertas)
- Estructuras JSONB (conversation_history, notes)
- Índices recomendados
- Diagrama de relaciones

**Commit:** `0b66b9a1`

---

**Resumen Sesión 8 Completa:**

| Tarea | Estado |
|-------|--------|
| Optimización costos (Parte 1) | ✅ -8% tokens |
| Documentación APIs (Parte 2) | ✅ 50+ endpoints |
| QA Conversaciones (Parte 3) | ✅ 12/12 tests |
| Monitoreo (Parte 3) | ✅ Sistema healthy |
| Optimización adicional (Parte 3) | ✅ -827 chars |
| Schemas Supabase (Parte 3) | ✅ 10 tablas |

**Ahorro total de tokens:** ~9% (~1,750 tokens/mensaje)

### 2026-01-30 (Sesión 8 - Parte 4) - Calidad y Edge Cases

**Nuevas funcionalidades:**

1. **Detección de mensajes duplicados (leadMessageService.ts)**
   - Si un lead envía 3+ mensajes idénticos consecutivos
   - SARA responde con menú de opciones en lugar de repetir

2. **Endpoint de calidad `/api/metrics/quality`**
   - Analiza respuestas de SARA de los últimos N días
   - Detecta: truncados, nombres inventados, frases prohibidas
   - Agrupa problemas por tipo
   - Genera recomendaciones automáticas

3. **Limpieza de código muerto**
   - Eliminado `index.ts.backup` (17,000+ líneas)

4. **13 nuevos tests de edge cases**
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

**Tests:** 291 → **304** (todos pasan)

**Commit:** `2a36b614`

---

### 2026-01-30 (Sesión 9) - Flujos Post-Compra Completos

**Nuevos flujos implementados en `src/crons/nurturing.ts`:**

| Flujo | Trigger | Función |
|-------|---------|---------|
| **Seguimiento post-entrega** | 3-7 días post-delivered | `seguimientoPostEntrega()` |
| **Encuesta satisfacción casa** | 3-6 meses post-delivered | `encuestaSatisfaccionCasa()` |
| **Check-in mantenimiento** | ~1 año post-delivered | `checkInMantenimiento()` |

**Procesadores de respuesta:**
- `procesarRespuestaEntrega()` - Detecta problemas con llaves/escrituras/servicios
- `procesarRespuestaSatisfaccionCasa()` - Clasifica satisfacción 1-4
- `procesarRespuestaMantenimiento()` - Conecta con proveedores si necesita

**Calendario de CRONs Post-Compra:**

| Día | Hora | Flujo |
|-----|------|-------|
| Lunes | 10am | Seguimiento post-entrega |
| Martes | 11am | Encuesta satisfacción casa |
| Miércoles | 11am | Solicitud de referidos |
| Jueves | 10am | Seguimiento post-entrega |
| Viernes | 10am | Encuestas NPS |
| Sábado | 10am | Check-in mantenimiento |

**Endpoints manuales agregados:**
- `/run-post-entrega` - Seguimiento post-entrega
- `/run-satisfaccion-casa` - Encuesta satisfacción
- `/run-mantenimiento` - Check-in mantenimiento

**Flujo completo post-compra:**
```
delivered → 3-7 días: 🔑 Seguimiento entrega
         → 30-90 días: 🤝 Referidos
         → 3-6 meses: 🏡 Satisfacción casa
         → 7-30 días: 📊 NPS
         → ~1 año: 🔧 Mantenimiento
         → Cada año: 🎉 Aniversario
```

**Archivos modificados:**
- `src/crons/nurturing.ts` - 6 nuevas funciones (~500 líneas)
- `src/index.ts` - Imports, CRONs, endpoints, procesadores de respuesta
- `CLAUDE.md` - Documentación actualizada
- `docs/api-reference.md` - Nuevos endpoints documentados

**Tests:** 304/304 pasando ✅
**Deploy:** Version ID `44701c5a-192b-4281-8881-e9af4764f4e6`

---

### 2026-01-30 (Sesión 10) - Templates y Leads de Prueba Post-Compra

**1. Template `appointment_confirmation_v2` creado en Meta:**

| Campo | Valor |
|-------|-------|
| ID | `1439144957721245` |
| Status | PENDING (aprobación Meta) |
| Categoría | UTILITY |
| Texto | `¡Hola {{1}}! Gracias por agendar con {{2}}. Tu cita {{3}} el {{4}} a las {{5}} está confirmada.` |
| Botón | URL dinámica "Ver ubicación 📍" → `https://maps.app.goo.gl/{{1}}` |

**2. Nuevo endpoint `/test-update-dates`:**

```typescript
POST /test-update-dates
Body: { phone, delivery_date?, purchase_date?, status_changed_at? }
// Actualiza fechas de leads para pruebas de CRONs post-compra
```

**3. Leads de prueba para CRONs post-compra:**

| Lead | Phone | Status | Fecha | CRON Objetivo |
|------|-------|--------|-------|---------------|
| Test PostEntrega 5dias | 5210000000101 | delivered | delivery: 2026-01-25 | Lun/Jue 10am |
| Test Satisfaccion 4meses | 5210000000102 | delivered | delivery: 2025-09-30 | Martes 11am |
| Test Mantenimiento 1año | 5210000000103 | delivered | delivery: 2025-01-30 | Sábado 10am |
| Test Referidos 60dias | 5210000000104 | sold | purchase: 2026-01-15 | Viernes 10am (NPS) |
| Test NPS 15dias | 5210000000105 | sold | purchase: 2025-12-01 | Miércoles 11am (Referidos) |

**Verificación de elegibilidad:**
- Los leads tienen teléfonos ficticios (521000000010X) para no enviar WhatsApp real
- Fechas configuradas para que cada CRON los detecte en su ventana de tiempo
- Usar endpoints `/run-*` para probar manualmente

**Commit:** `629a5111`
**Deploy:** Version ID `a386f140-5942-4696-b13e-b5239451a52c`

---

### 2026-01-30 (Sesión 11) - Análisis Completo de Templates y Respuestas

**Auditoría de todos los templates que SARA envía y cómo maneja las respuestas:**

#### Templates CON handler específico ✅

| Template | Handler | Ubicación | Qué hace |
|----------|---------|-----------|----------|
| `appointment_confirmation` | ✅ | `whatsapp.ts:777-815` | Detecta "sí/confirmo" vs "no/cambiar" |
| `info_credito` | ✅ | `whatsapp.ts:818-939` | Detecta interés, agenda llamada con asesor |
| `reagendar_noshow` | ✅ | `whatsapp.ts:11305-11348` | Notifica vendedor, responde al lead |
| Encuestas NPS/post_cita | ✅ | `whatsapp.ts:11370+` | Procesa calificación 1-4 o 0-10 |

#### Templates CON contexto para SARA ✅

| Template | Contexto | Ubicación |
|----------|----------|-----------|
| `promo_desarrollo` | `broadcastContext` | `leadMessageService.ts:794-883` |
| `recordatorio_cita_*` | `citaExistenteInfo` | `aiConversationService.ts:152-161` |
| `seguimiento_lead` | Historial | `whatsapp.ts:942-945` |

#### Templates CON pending states ✅

| Template | Pending State | Handler |
|----------|---------------|---------|
| `feliz_cumple` | `pending_birthday_response` | `leadMessageService.ts:661-700` |
| Aniversario | `Aniversario YYYY` | `leadMessageService.ts:707-729` |
| `referidos_postventa` | Regex detección | `leadMessageService.ts:736-788` |

#### Flujos verificados:

**Promociones:**
```
1. promo_desarrollo enviado → last_broadcast guardado
2. Lead responde → checkBroadcastResponse() detecta
3. broadcastContext pasado a SARA
4. SARA responde con contexto de la promoción ✅
```

**Reagendar (no-show):**
```
1. reagendar_noshow enviado → pending_noshow_response guardado
2. Lead responde → handler línea 11305 detecta
3. Vendedor notificado: "María respondió: [mensaje]"
4. Lead recibe: "¡Gracias! Tu asesor te contactará..." ✅
```

**Conclusión:** Todos los 13 templates tienen handlers o contexto adecuado.

**Tests:** 351/351 pasando ✅
