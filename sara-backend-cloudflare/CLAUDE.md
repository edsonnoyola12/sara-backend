# SARA CRM - Referencia para Claude Code

> Última actualización: 2026-03-02 (Sesión 77)
> Historial detallado de cambios: `docs/CHANGELOG.md`

---

## STACK TECNOLÓGICO

| Componente | Tecnología | Archivo/Carpeta |
|------------|------------|-----------------|
| Runtime | Cloudflare Workers | `wrangler.toml` |
| Base de datos | Supabase (PostgreSQL) | `src/services/supabase.ts` |
| Cache | Cloudflare KV | `SARA_CACHE` namespace |
| WhatsApp | Meta Cloud API | `src/services/meta-whatsapp.ts` |
| IA Conversacional | Claude (Anthropic) | `src/services/claudeService.ts` |
| Videos | Google Veo 3 | `src/services/veoService.ts` |
| Calendar | Google Calendar API | `src/services/calendarService.ts` |
| Frontend CRM | React + Vercel | `sara-crm-new/` (repo separado) |
| Telefonía | Zadarma | Número +524923860066 |
| Llamadas IA | Retell.ai | `src/services/retellService.ts` |
| Backups | Cloudflare R2 | `SARA_BACKUPS` bucket — JSONL semanales |

---

## ANTES DE HACER CUALQUIER COSA

```bash
# 1. Lee la documentación completa
cat SARA_COMANDOS.md | head -500

# 2. Verifica tests (OBLIGATORIO - 1083+ tests, 32 archivos)
npm test

# 3. Si falla algún test, NO hagas cambios
```

---

## REGLAS CRÍTICAS (NO NEGOCIABLES)

1. **NO reimplementes** — Lee `SARA_COMANDOS.md` primero
2. **NO borres código** sin entender por qué existe
3. **NO modifiques** secciones marcadas `CRÍTICO - NO MODIFICAR`
4. **SIEMPRE** corre `npm test` antes de commit
5. **ACTUALIZA** `SARA_COMANDOS.md` con cada cambio

---

## ARCHIVOS CRÍTICOS (MANEJAR CON CUIDADO)

| Archivo | Líneas | Función | Riesgo |
|---------|--------|---------|--------|
| `src/index.ts` | ~3,650 | Router principal (modularizado) | MEDIO |
| `src/handlers/whatsapp.ts` | ~2,390 | Dispatcher + lead flow | MEDIO |
| `src/handlers/whatsapp-vendor.ts` | ~6,350 | Handlers vendedor (93 funciones) | ALTO |
| `src/handlers/whatsapp-ceo.ts` | ~1,860 | Handlers CEO (14 funciones) | ALTO |
| `src/handlers/whatsapp-utils.ts` | ~1,960 | Utilidades compartidas + findLeadByName | MEDIO |
| `src/handlers/whatsapp-agencia.ts` | ~652 | Handlers agencia/marketing | MEDIO |
| `src/handlers/whatsapp-asesor.ts` | ~554 | Handlers asesor | MEDIO |
| `src/services/aiConversationService.ts` | ~8,740 | IA + prompts + phase-aware + carousels | ALTO |
| `src/services/creditFlowService.ts` | ~1,400 | Flujo hipotecario | MEDIO |
| `src/routes/retell.ts` | ~2,840 | Retell.ai webhooks + tools + post-call | ALTO |
| `src/services/meta-whatsapp.ts` | ~1,660 | Meta API (CTA, carousel, reactions, vCard) | MEDIO |

### Módulos CRON

| Módulo | Funciones |
|--------|-----------|
| `src/crons/reports.ts` | Reportes diarios/semanales/mensuales |
| `src/crons/briefings.ts` | Briefings matutinos, logEvento |
| `src/crons/alerts.ts` | Alertas de leads, cumpleaños, leads fríos/calientes |
| `src/crons/followups.ts` | Follow-ups, nurturing, broadcasts, re-engagement |
| `src/crons/leadScoring.ts` | Scoring, señales calientes, objeciones |
| `src/crons/nurturing.ts` | NPS, referidos, post-compra, satisfacción, cleanup |
| `src/crons/maintenance.ts` | Bridges, leads estancados, aniversarios |
| `src/crons/videos.ts` | Videos Veo 3 personalizados |
| `src/crons/dashboard.ts` | Status, analytics, health, backup |
| `src/crons/healthCheck.ts` | Health monitor, error digest, observability |

### Servicios (89+ total)

Servicios de inteligencia de negocio en `src/services/`:
`pipelineService`, `financingCalculatorService`, `propertyComparatorService`, `closeProbabilityService`, `visitManagementService`, `offerTrackingService`, `smartAlertsService`, `marketIntelligenceService`, `customerValueService`, `referralService`, `cotizacionService`, `developmentFunnelService`, `observabilityService`, `pdfReportService`, `webhookService`, `cacheService`, `retellService`, `ttsService`, `surveyService`, `messageQueueService`, `retryQueueService`

Utilidades clave:
- `src/utils/teamMessaging.ts` — Sistema híbrido mensajes + llamadas + templateOverride
- `src/utils/safeHelpers.ts` — safeJsonParse, safeSupabaseWrite, sanitizeForPrompt

---

## TELÉFONOS DEL EQUIPO

| Rol | Teléfono | Nombre | Acceso |
|-----|----------|--------|--------|
| **Dueño/Dev** | **5610016226** | Edson | Teléfono principal para pruebas |
| **Dueño/Dev** | **2224558475** | Edson | Teléfono secundario |
| CEO/Admin | 5214922019052 | Oscar Castelo | TODOS los comandos |
| Vendedor Test | 5212224558475 | Vendedor Test | Solo vendedor |

**SOLO usar 5610016226 y 5212224558475 para pruebas. NUNCA el teléfono de Oscar.**

Oscar (CEO) tiene fallback a todos los roles: CEO → Asesor → Vendedor → Marketing

---

## DESARROLLOS Y UBICACIONES

| Zona | Desarrollos | Tipo |
|------|-------------|------|
| **Colinas del Padre (Zacatecas)** | Monte Verde, Los Encinos, Miravalle, Paseo Colorines, Monte Real | CASAS |
| **Guadalupe** | Andes (Vialidad Siglo XXI), Distrito Falco (Calzada Solidaridad) | CASAS |
| **Citadella del Nogal (Guadalupe)** | Villa Campelo, Villa Galiano | TERRENOS |

**Sinónimos:** "Citadella del Nogal" / "El Nogal" = Villa Campelo + Villa Galiano
**Alberca:** SOLO Priv. Andes tiene alberca
**Precios:** 100% dinámicos desde DB (`properties` table). 0 precios hardcodeados.
**Tabla `properties`** NO tiene columna `active`. Todas se consideran activas.

---

## FLUJOS DE NEGOCIO PRINCIPALES

### 1. Lead → Venta (Funnel)
```
new → contacted → qualified → scheduled → visited → negotiation → reserved → closed → delivered
```
Status aliases: `visit_scheduled`→`scheduled`, `negotiating`→`negotiation`, `sold`→`closed`

### 2. Bridge (Chat Directo)
CEO/Vendedor: `bridge [nombre]` → 6 min → `#cerrar` / `#mas`

### 3. Crédito Hipotecario
Lead pregunta crédito → SARA califica → Asigna asesor + notifica vendedor original + asesor via `enviarMensajeTeamMember`. AMBOS reciben recordatorios 24h y 2h.

### 4. Ventana de 24 Horas de WhatsApp (CRÍTICO)

WhatsApp solo permite mensajes libres si el usuario escribió en las últimas 24h.

**Solución:** `enviarMensajeTeamMember()` en `src/utils/teamMessaging.ts`
- Ventana abierta → mensaje directo
- Ventana cerrada → template + guarda en `pending_*`
- Cuando responden → se entrega el mensaje pendiente
- Si template falla → fallback a `reactivar_equipo`

**Templates APPROVED:**
- `briefing_matutino` (UTILITY) — nombre, citas, leads, tip
- `reporte_vendedor` (UTILITY) — nombre, leads_nuevos, citas_completadas, citas_total, pipeline, insight
- `reporte_asesor` (UTILITY) — nombre, solicitudes, aprobadas, pipeline_activo

**Templates Carousel (MARKETING, es_MX):**
- `casas_economicas` — Monte Verde, Andes, Alpes
- `casas_premium` — Los Encinos, Miravalle, Paseo Colorines, Distrito Falco
- `terrenos_nogal` — Villa Campelo, Villa Galiano

**Pending keys:** `pending_alerta_lead` (prioridad 1), `pending_briefing`, `pending_recap`, `pending_reporte_diario`, `pending_resumen_semanal`, `pending_mensaje`

Pending se verifican PRIMERO en handlers de vendedor y CEO, ANTES de cualquier otra lógica.

### 5. Retell.ai (Llamadas IA) — ACTIVADO

**Comando vendedor:** `llamar ia [nombre]` — SARA llama al lead por teléfono con IA.
**A leads:** Si no responde WhatsApp en 48h → escalar a llamada. NUNCA WhatsApp + llamada para lo mismo.
**Al equipo:** Si ventana cerrada y mensaje CRÍTICO → llamar inmediatamente. NORMAL → template, llamar después de 2h.
**Entrantes:** Llamadas al +524923860066 → SARA contesta, reconoce lead por teléfono.

14+ motivos context-aware con instrucciones específicas por tipo de llamada.
9 herramientas in-call (buscar info, agendar/cancelar/cambiar cita, enviar WhatsApp, crédito, presupuesto).
Feature flag: `retell_enabled` en KV (controlable via `/api/flags`). Todos los CRONs y el comando manual lo respetan.
**Retry automático:** Si nadie contesta → reintento en 3h (intento 1) o mañana 10am (intento 2). Max 2 reintentos.
**Dashboard:** CEO comando `llamadas` → métricas mensuales (outcomes, sentimiento, conversión, top vendedores).
**Cadencia inteligente:** Secuencia multi-paso WhatsApp + llamada IA (3 tipos: lead_nuevo, lead_frio, post_visita). Flag: `cadencia_inteligente`.

### 6. Flujos Post-Compra (CRONs automáticos)

| Día | Hora | Flujo | Trigger |
|-----|------|-------|---------|
| Lun/Jue | 10am | Seguimiento post-entrega | 3-7 días post-delivered |
| Martes | 11am | Encuesta satisfacción casa | 3-6 meses post-delivered |
| Miércoles | 11am | Solicitud de referidos | 30-90 días post-sold |
| Viernes | 10am | Encuestas NPS | 7-30 días post-visita/compra |
| Sábado | 10am | Check-in mantenimiento | ~1 año post-delivered |
| L-V | 9am | Aniversarios | Cada año |

Encuestas usan patrón **mark-before-send** + regex estrictos + TTL 48h + `isLikelySurveyResponse()`.

### 7. pending_auto_response (16 tipos)

Cuando SARA envía mensaje automático a un lead, guarda `pending_auto_response` en notes. Si el lead responde, `checkAutoMessageResponse()` captura con contexto antes de pasar a IA genérica.

Tipos: `lead_frio`, `reengagement`, `cumpleanos`, `aniversario`, `postventa`, `recordatorio_pago`, `seguimiento_credito`, `followup_inactivo`, `remarketing`, `recordatorio_cita`, `referidos`, `nps`, `post_entrega`, `satisfaccion_casa`, `mantenimiento`, `checkin_60d`

---

## COMANDOS POR ROL

### CEO (Oscar - 5214922019052)

| Categoría | Comandos |
|-----------|----------|
| Reportes | `leads`, `hoy`, `briefing`, `equipo`, `ventas`, `conexiones`, `reporte semanal/mensual`, `meta`, `status/salud`, `respuestas/log ia`, `backups` |
| Análisis | `pipeline/funnel`, `probabilidad/forecast`, `visitas`, `alertas/riesgos`, `mercado/competencia`, `clv/referidos`, `programa referidos/referral`, `segmentos`, `llamadas/calls` |
| Finanzas | `calcular [precio]`, `bancos`, `comparar [A] vs [B]` |
| Comunicación | `bridge [nombre]`, `#cerrar/#mas`, `mensaje [nombre] [texto]`, `broadcast`, `enviar a [segmento]: [msg]` |
| Leads | `adelante/atrás [nombre]`, `quién es`, `historial`, `nota`, `notas`, `asignar [lead] a [vendedor]` |
| Ofertas | `ofertas/cotizaciones`, `oferta [nombre]` |
| Recursos | `brochure/ubicación/video [desarrollo]`, `propiedades` |
| **+ Todos los comandos de Asesor, Vendedor y Marketing** |

### Vendedor

| Categoría | Comandos |
|-----------|----------|
| Info | `hoy/briefing`, `citas/citas mañana`, `mis leads`, `hot`, `pendientes`, `meta` |
| Citas | `agendar cita [nombre] [fecha] [hora]`, `reagendar`, `cancelar cita` |
| Leads | `adelante/atrás`, `nota`, `notas`, `quién es`, `historial`, `perdido`, `nuevo lead`, `pausar/reanudar`, `entregado/delivery` |
| Ofertas | `cotizar [nombre] [precio]`, `ofertas`, `enviar oferta`, `oferta aceptada/rechazada` |
| Recursos | `brochure/ubicación/video [desarrollo]`, `llamar`, `contactar`, `coaching` |
| Crédito | `crédito [nombre]`, `asignar asesor` |
| Bridge | `bridge [nombre]`, `#cerrar/#mas` |
| Ventas | `cerrar venta [nombre] [propiedad]`, `apartado [nombre] [propiedad]` |

### Asesor Hipotecario

`mis leads`, `docs [nombre]`, `preaprobado/rechazado/contactado [nombre]`, `status`, `reporte`, `llamar [nombre]`, `hoy/mañana/semana`, `adelante/atrás`, `on/off`, `bridge`

### Marketing/Agencia

`campañas`, `metricas`, `segmentos`, `broadcast`, `enviar a [segmento]: [mensaje]`

---

## ESTRUCTURA DE PROYECTO

```
sara-backend-cloudflare/
├── src/
│   ├── index.ts              # Router principal (~3.6K líneas)
│   ├── handlers/             # WhatsApp handlers por rol (7 archivos)
│   ├── crons/                # Módulos CRON (10 archivos)
│   ├── services/             # 89+ servicios
│   ├── routes/               # API routes (api-core, api-bi, retell, test)
│   ├── utils/                # Helpers (teamMessaging, safeHelpers, uxHelpers)
│   └── tests/                # 32 archivos de test
├── docs/                     # Documentación técnica
│   ├── FLUJOS_CRITICOS.md    # Horario completo + 7 flujos + reglas de oro
│   ├── CHANGELOG.md          # Historial detallado de cambios
│   ├── api-reference.md      # Referencia de APIs
│   └── database-schema.md    # Schemas de Supabase
├── wrangler.toml             # Config Cloudflare
├── SARA_COMANDOS.md          # Documentación de comandos
└── CLAUDE.md                 # Este archivo
```

---

## DEPLOY

```bash
npm test                                    # OBLIGATORIO
npx wrangler deploy --env staging           # Staging primero
npx wrangler deploy                         # Producción
npx wrangler tail --format=pretty           # Logs en tiempo real
```

**URLs:**
- Producción: `https://sara-backend.edson-633.workers.dev`
- Staging: `https://sara-backend-staging.edson-633.workers.dev`
- CRM: `https://sara-crm-new.vercel.app`

---

## ENDPOINTS PRINCIPALES

| Endpoint | Uso |
|----------|-----|
| `/health` | Status del sistema |
| `/test-ai-response?msg=X&api_key=Y` | Prueba IA (no envía WhatsApp) |
| `/test-lead?phone=X&name=Y&msg=Z&api_key=W` | Flujo lead real (SÍ envía WhatsApp) |
| `/test-vendedor-msg?phone=X&msg=Y&api_key=Z` | Simula mensaje vendedor/CEO |
| `/test-comando-vendedor?cmd=X&phone=Y&api_key=Z` | QA vendedor (107 comandos) |
| `/test-comando-ceo?cmd=X&api_key=Z` | QA CEO (100 comandos) |
| `/test-comando-asesor?cmd=X&phone=Y&api_key=Z` | QA asesor (90 comandos) |
| `/test-comando-agencia?cmd=X&phone=Y&api_key=Z` | QA agencia (45 comandos) |
| `/test-retell-e2e?api_key=Y` | E2E Retell (25 tests) |
| `/test-resilience-e2e?api_key=Y` | E2E Resilience (12 tests) |
| `/test-carousel?phone=X&segment=Y&api_key=Z` | Carousel template |
| `/run-health-monitor?api_key=Z` | Forzar health monitor |
| `/run-backup?api_key=Z` | Forzar backup R2 |
| `/api/leads`, `/api/team-members`, `/api/properties`, `/api/appointments` | APIs CRM (auth) |
| `/api/referrals`, `/api/referrals/stats` | APIs referral program (auth) |

**Auth:** `Authorization: Bearer <API_SECRET>` o `?api_key=<API_SECRET>`

---

## REGLAS ADICIONALES

Ver `.claude/rules/`: `whatsapp.md`, `cloudflare.md`, `supabase.md`
Ver `docs/`: `FLUJOS_CRITICOS.md`, `api-reference.md`, `database-schema.md`

---

## SI ALGO SALE MAL

```bash
git log --oneline -5    # Ver commits recientes
git revert HEAD          # Revertir último commit
npm test                 # Verificar tests
npx wrangler deploy      # Re-deploy
```

---

## ESTADO ACTUAL DEL SISTEMA

| Métrica | Valor |
|---------|-------|
| Tests | 1107 (33 archivos) |
| Servicios | 89+ |
| Comandos verificados | 342/342 (4 roles) |
| CRONs activos | 30+ |
| Templates WA | 6 (3 equipo + 3 carousel) |
| Propiedades | 32 (9 desarrollos) |
| Precios | 100% dinámicos (0 hardcoded) |
| WhatsApp UX | CTA buttons, reactions, contact cards |
| Retell.ai | ACTIVADO — 9 tools, inbound +524923860066, flag unificado KV |
| Resilience | Retry queue (backoff exponencial), mark-before-send, cache invalidation, AI fallback, KV dedup, fetch timeouts, atomic writes, error persistence, double-booking prevention |
| Integraciones | Meta/WhatsApp ✅, Supabase ✅, Cloudflare ✅, Google Calendar ✅, Veo 3 ✅, Retell ✅ |
