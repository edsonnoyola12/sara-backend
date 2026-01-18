# INSTRUCCIONES PARA CLAUDE CODE

## ANTES DE HACER CUALQUIER COSA

**LEE OBLIGATORIAMENTE** el archivo `SARA_COMANDOS.md` para entender:
- Qué comandos ya existen
- Qué flujos ya están implementados
- Qué bugs ya se arreglaron
- Cómo funcionan los roles (CEO, Asesor, Vendedor, Lead)

## REGLAS CRÍTICAS

1. **NO reimplementes** funcionalidad que ya existe - revisa primero
2. **NO borres** código existente sin entender por qué está ahí
3. **SIEMPRE** revisa `SARA_COMANDOS.md` antes de agregar comandos nuevos
4. **ACTUALIZA** `SARA_COMANDOS.md` cuando agregues/cambies funcionalidad

## ESTRUCTURA DEL PROYECTO

- `src/handlers/whatsapp.ts` - Handler principal de WhatsApp
- `src/services/ceoCommandsService.ts` - Comandos CEO
- `src/services/asesorCommandsService.ts` - Comandos Asesor
- `src/services/bridgeService.ts` - Sistema de bridge/chat directo
- `src/services/creditFlowService.ts` - Flujo de crédito hipotecario

## DEPLOY

```bash
npx wrangler deploy
```

## LOGS

```bash
npx wrangler tail --format=pretty
```

## TELÉFONOS DE PRUEBA

- CEO: 5212224558475
- Lead: 5215610016226
