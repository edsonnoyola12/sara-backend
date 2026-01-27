# SARA CRM - Memoria Principal para Claude Code

> **IMPORTANTE**: Este archivo se carga automáticamente en cada sesión.
> Última actualización: 2026-01-27

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
| `src/index.ts` | ~25,000 | Router principal + CRONs | ALTO |
| `src/handlers/whatsapp.ts` | ~11,000 | Handler de mensajes | ALTO |
| `src/services/aiConversationService.ts` | ~7,300 | IA + prompts | ALTO |
| `src/services/creditFlowService.ts` | ~1,400 | Flujo hipotecario | MEDIO |

### Secciones Protegidas

Busca estos comentarios antes de modificar:
```
╔════════════════════════════════════════════════════════════════════════╗
║  CRÍTICO - NO MODIFICAR SIN CORRER TESTS: npm test                     ║
╚════════════════════════════════════════════════════════════════════════╝
```

---

## FLUJOS DE NEGOCIO PRINCIPALES

### 1. Lead → Venta (Funnel)
```
new → contacted → scheduled → visited → negotiation → reserved → closed
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

### 4. Videos Veo 3
```
Lead nuevo → Generar video personalizado → Subir a Meta → Enviar
```
**IMPORTANTE**: Usar `uploadVideoFromBuffer()` + `sendWhatsAppVideoById()`

---

## COMANDOS POR ROL

### CEO
| Comando | Función |
|---------|---------|
| `leads` / `hoy` | Ver leads del día |
| `bridge [nombre]` | Chat directo con lead |
| `mensaje [nombre] [texto]` | Enviar via SARA |
| `equipo` / `ventas` | Métricas |
| `broadcast [mensaje]` | Envío masivo |

### Vendedor
| Comando | Función |
|---------|---------|
| `citas` / `citas mañana` | Ver agenda |
| `mis leads` | Leads asignados |
| `agendar cita con [nombre]` | Crear cita |
| `nota [nombre] [texto]` | Agregar nota |
| `bridge [nombre]` | Chat directo |
| `recordar llamar [nombre]` | Programar llamada |

### Asesor Hipotecario
| Comando | Función |
|---------|---------|
| `mis leads` | Leads de crédito asignados |
| `docs [nombre]` | Ver documentos |
| `preaprobado [nombre]` | Marcar preaprobado |
| `rechazado [nombre]` | Marcar rechazado |

---

## ESTRUCTURA DE PROYECTO

```
sara-backend-cloudflare/
├── src/
│   ├── index.ts              # Router principal (25K líneas)
│   ├── handlers/
│   │   └── whatsapp.ts       # Handler WhatsApp (11K líneas)
│   ├── services/
│   │   ├── aiConversationService.ts  # IA (7K líneas)
│   │   ├── ceoCommandsService.ts
│   │   ├── vendorCommandsService.ts
│   │   ├── asesorCommandsService.ts
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
| `/test-real?test=X` | GET | Tests de funcionalidad |
| `/debug-lead?phone=X` | GET | Debug de un lead |
| `/api/leads` | GET | Lista de leads (auth) |
| `/api/team-members` | GET | Lista de equipo (auth) |

**Autenticación**: Header `Authorization: Bearer <API_SECRET>` o `?api_key=<API_SECRET>`

---

## TELÉFONOS DE PRUEBA

| Rol | Teléfono | Nombre |
|-----|----------|--------|
| CEO | 5212224558475 | Oscar Castelo |
| Vendedor | 5215610016226 | Vendedor Test |

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
