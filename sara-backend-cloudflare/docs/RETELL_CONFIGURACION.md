# Configuración de Retell.ai para SARA

## Problema: Llamadas entrantes no funcionan

Si SARA puede hacer llamadas salientes pero NO puede recibir llamadas entrantes, sigue esta guía.

---

## 1. Configuración del Número de Teléfono

### En Retell Dashboard → Phone Numbers

1. **Selecciona tu número** (el de Zadarma)
2. **Asocia el número a tu Agente SARA**
   - Campo: "Agent" o "Connected Agent"
   - Selecciona el agente de SARA

**Sin esta asociación, Retell no sabe qué agente debe contestar las llamadas entrantes.**

---

## 2. Configuración de Webhooks

### En Retell Dashboard → Settings → Webhooks

| Webhook | URL | Propósito |
|---------|-----|-----------|
| **Pre-call Lookup** | `https://sara-backend.edson-633.workers.dev/webhook/retell/lookup` | Busca el lead ANTES de contestar para personalizar saludo |
| **Call Events** | `https://sara-backend.edson-633.workers.dev/webhook/retell` | Recibe eventos (call_started, call_ended, call_analyzed) |

### Configuración de Pre-call Lookup

En el dashboard de Retell:
1. Ve a tu Agente → Settings → "Pre-call Lookup"
2. Habilita "Enable pre-call data lookup"
3. Ingresa la URL: `https://sara-backend.edson-633.workers.dev/webhook/retell/lookup`
4. Método: POST

**Respuesta del webhook lookup:**
```json
{
  "lead_name": "Juan",
  "lead_full_name": "Juan Pérez",
  "lead_id": "uuid",
  "is_new_lead": "false",
  "desarrollo_interes": "Monte Verde",
  "greeting": "¡Hola Juan! Qué gusto escucharte de nuevo. Soy Sara de Grupo Santa Rita..."
}
```

---

## 3. Configuración del Agente para Llamadas Entrantes

### En Retell Dashboard → Tu Agente → Settings

1. **General Settings:**
   - Nombre: SARA
   - Voz: Selecciona voz en español (mujer)

2. **Inbound Call Settings:**
   - ✅ Enable inbound calls: **DEBE ESTAR HABILITADO**
   - Phone number: Debe mostrar tu número asociado

3. **Variables Dinámicas:**
   Asegúrate de que el agente use estas variables que el lookup webhook envía:
   - `{{lead_name}}` - Nombre del lead
   - `{{is_new_lead}}` - Si es nuevo o existente
   - `{{greeting}}` - Saludo personalizado
   - `{{desarrollo_interes}}` - Desarrollo de interés

---

## 4. Prompt del Agente en Retell

El agente debe usar el `{{greeting}}` como saludo inicial. Ejemplo:

```
## Inicio de llamada
Usa exactamente este saludo: {{greeting}}

Si {{is_new_lead}} es "true":
- Pregunta el nombre del cliente
- Pregunta cómo se enteró de nosotros

Si {{is_new_lead}} es "false":
- El cliente se llama {{lead_name}}
- Su desarrollo de interés es {{desarrollo_interes}}
```

---

## 5. Verificar que el número está configurado en Zadarma

El número de teléfono de Zadarma debe estar:
1. **Forwardeando a Retell** - En Zadarma, configura el reenvío SIP a Retell
2. **En formato E.164** - Ejemplo: +524921234567

### Configuración en Zadarma:
1. Dashboard Zadarma → My PBX → Incoming calls
2. Configura el destino como SIP trunk a Retell
3. Los credentials de SIP te los da Retell al agregar el número

---

## 6. Probar la Configuración

### Prueba 1: Verificar que el webhook lookup funciona
```bash
curl -X POST https://sara-backend.edson-633.workers.dev/webhook/retell/lookup \
  -H "Content-Type: application/json" \
  -d '{"from_number": "+525610016226"}'
```

Deberías recibir una respuesta con datos del lead.

### Prueba 2: Llamar al número
1. Desde un teléfono móvil, llama al número de Zadarma
2. Si está bien configurado:
   - Retell contesta
   - SARA saluda (personalizado si el número está en la BD)
   - El vendedor recibe notificación por WhatsApp

### Prueba 3: Ver logs
```bash
npx wrangler tail --format=pretty
```
Busca logs que digan `📞 RETELL LOOKUP:` o `📞 RETELL WEBHOOK:`

---

## 7. Troubleshooting

### Problema: La llamada no entra a SARA
**Causas posibles:**
- Número NO asociado a agente en Retell
- SIP trunk mal configurado en Zadarma
- Número no verificado en Retell

### Problema: Entra la llamada pero no saluda correctamente
**Causas posibles:**
- Pre-call lookup URL incorrecta
- El agente no usa las variables dinámicas
- Error en el webhook (verificar logs)

### Problema: No llegan notificaciones al vendedor
**Causas posibles:**
- Webhook de eventos no configurado
- El lead no tiene vendedor asignado en Supabase

---

## 8. URLs de Referencia

| Recurso | URL |
|---------|-----|
| Backend SARA | https://sara-backend.edson-633.workers.dev |
| Webhook Lookup | /webhook/retell/lookup |
| Webhook Events | /webhook/retell |
| Debug último webhook | /debug-retell |
| Retell Dashboard | https://app.retellai.com |
| Zadarma Dashboard | https://my.zadarma.com |

---

## 9. Checklist Final

- [ ] Número de teléfono asociado a agente en Retell
- [ ] Pre-call lookup URL configurada
- [ ] Events webhook URL configurada
- [ ] Inbound calls habilitado en el agente
- [ ] SIP trunk configurado en Zadarma → Retell
- [ ] Agente usa variables dinámicas ({{greeting}}, {{lead_name}})
- [ ] Probado con llamada real
- [ ] Verificado que llegan notificaciones WhatsApp

---

**Última actualización:** 2026-02-05
