# INSTRUCCIONES PARA CLAUDE CODE

## ANTES DE HACER CUALQUIER COSA

1. **LEE `SARA_COMANDOS.md`** - Contiene TODO lo que ya existe
2. **CORRE `npm test`** - Si no pasan los 211 tests, NO hagas cambios

## REGLAS CRÍTICAS

1. **NO reimplementes** funcionalidad que ya existe
2. **NO borres** código sin entender por qué está ahí
3. **NO modifiques** secciones marcadas con `CRÍTICO - NO MODIFICAR`
4. **SIEMPRE** corre `npm test` antes de commit
5. **ACTUALIZA** `SARA_COMANDOS.md` cuando hagas cambios

## SECCIONES PROTEGIDAS - NO TOCAR SIN TESTS

| Archivo | Línea aprox | Qué hace |
|---------|-------------|----------|
| `aiConversationService.ts` | ~3588 | GPS solo cuando pide ubicación |
| `whatsapp.ts` | ~1257 | Bridge CEO ↔ Lead |
| `whatsapp.ts` | ~2997 | Bridge Vendedor ↔ Lead |

Busca comentarios que dicen:
```
╔════════════════════════════════════════════════════════════════════════╗
║  CRÍTICO - NO MODIFICAR SIN CORRER TESTS: npm test                     ║
```

## TESTS OBLIGATORIOS

```bash
# SIEMPRE correr antes de commit
npm test

# Si falla algún test = NO HACER COMMIT
# Los tests protegen:
# - GPS: 10 tests
# - Recursos (video/brochure): 12 tests
# - Bridge (chat directo): 8 tests
# - Regresiones: 5 tests
# - Notas en CRM: 12 tests
# - Recap condicional: 8 tests
# - Sugerencias IA: 6 tests
# - Comandos existentes (regresión): 17 tests
```

## LÓGICA DE NEGOCIO CRÍTICA

### GPS
- Si lead pide SOLO ubicación → enviar SOLO GPS
- Si lead pide info completa → enviar video + recursos + GPS
- Archivo de lógica: `src/utils/conversationLogic.ts`
- Tests: `src/tests/conversationLogic.test.ts`

### Recursos
- Video, brochure, matterport, GPS
- NO enviar duplicados (verificar `resources_sent_for`)
- En flujo crédito, NO enviar recursos automáticamente

### Bridge
- Chat directo por 6 minutos
- NO reenviar comandos al lead (bridge X, cerrar, etc)
- SÍ reenviar mensajes normales

## ESTRUCTURA DEL PROYECTO

```
src/
├── handlers/
│   └── whatsapp.ts          # Handler principal (GRANDE)
├── services/
│   ├── aiConversationService.ts  # Lógica de IA (GRANDE)
│   ├── ceoCommandsService.ts
│   ├── asesorCommandsService.ts
│   ├── vendorCommandsService.ts
│   └── bridgeService.ts
├── utils/
│   └── conversationLogic.ts  # Lógica extraída para tests
└── tests/
    ├── conversationLogic.test.ts  # 35 tests GPS/recursos
    ├── vendorCommands.test.ts     # 30 tests comandos vendedor
    ├── newFeatures.test.ts        # 43 tests notas/recap/IA
    └── ...otros tests
```

## DEPLOY

```bash
# 1. SIEMPRE correr tests primero
npm test

# 2. Solo si pasan, hacer deploy
npx wrangler deploy

# 3. Verificar logs
npx wrangler tail --format=pretty
```

## TELÉFONOS DE PRUEBA

- CEO: 5212224558475
- Lead: 5215610016226

## SI LA CAGAS

1. `git log --oneline -5` - Ver commits recientes
2. `git revert HEAD` - Revertir último commit
3. `npm test` - Verificar que tests pasen
4. `npx wrangler deploy` - Deploy versión buena
