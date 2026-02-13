# Reglas para Código de WhatsApp

## Archivos Principales

| Archivo | Responsabilidad |
|---------|-----------------|
| `src/handlers/whatsapp.ts` | Dispatcher + lead flow (~2.2K líneas) |
| `src/handlers/whatsapp-vendor.ts` | Handlers vendedor (~6K líneas, 93 funciones) |
| `src/handlers/whatsapp-ceo.ts` | Handlers CEO (~1.9K líneas) |
| `src/handlers/whatsapp-utils.ts` | Utilidades compartidas (~1.6K líneas) |
| `src/handlers/whatsapp-agencia.ts` | Handlers agencia/marketing (~650 líneas) |
| `src/handlers/whatsapp-asesor.ts` | Handlers asesor (~550 líneas) |
| `src/handlers/whatsapp-types.ts` | HandlerContext interface |
| `src/services/metaWhatsAppService.ts` | Envío de mensajes a Meta API |
| `src/services/aiConversationService.ts` | Generación de respuestas IA |

---

## Reglas de Envío de Mensajes

### 1. Ventana de 24 Horas
```typescript
// Meta permite mensajes libres solo si el usuario escribió en las últimas 24h
// Si pasaron más de 24h → usar template aprobado

const ultimoMensaje = lead.last_message_at;
const hace24h = Date.now() - 24 * 60 * 60 * 1000;

if (new Date(ultimoMensaje).getTime() < hace24h) {
  // Usar template
  await meta.sendTemplate(phone, 'template_name', params);
} else {
  // Mensaje libre
  await meta.sendWhatsAppMessage(phone, mensaje);
}
```

### 2. No Enviar Duplicados
```typescript
// Verificar resources_sent_for antes de enviar recursos
const yaEnviado = lead.resources_sent_for?.includes(desarrollo);
if (!yaEnviado) {
  await enviarRecursos(lead, desarrollo);
  // Actualizar resources_sent_for
}
```

### 3. Rate Limiting
- Máximo 80 mensajes/segundo a nivel de cuenta
- Esperar entre mensajes en broadcasts
- Usar cola para envíos masivos

---

## Estructura de Webhook de Meta

```typescript
interface WebhookPayload {
  object: 'whatsapp_business_account';
  entry: [{
    id: string;
    changes: [{
      value: {
        messaging_product: 'whatsapp';
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts: [{ profile: { name: string }; wa_id: string }];
        messages: [{
          from: string;
          id: string;
          timestamp: string;
          type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'location';
          text?: { body: string };
          image?: { id: string; mime_type: string };
          // ...otros tipos
        }];
      };
      field: 'messages';
    }];
  }];
}
```

---

## Tipos de Mensaje a Enviar

### Texto Simple
```typescript
await meta.sendWhatsAppMessage(phone, 'Hola, soy SARA');
```

### Con Botones (máx 3)
```typescript
await meta.sendWhatsAppButtons(phone, 'Elige una opción:', [
  { id: 'opcion1', title: 'Opción 1' },
  { id: 'opcion2', title: 'Opción 2' }
]);
```

### Con Lista (máx 10 items)
```typescript
await meta.sendWhatsAppList(phone, 'Selecciona:', 'Ver opciones', [
  { id: 'item1', title: 'Item 1', description: 'Descripción' }
]);
```

### Template
```typescript
await meta.sendTemplate(phone, 'bienvenida', [
  { type: 'body', parameters: [{ type: 'text', text: nombre }] }
]);
```

### Imagen/Video/Documento
```typescript
// Por URL
await meta.sendWhatsAppImage(phone, imageUrl, 'Caption opcional');

// Por Media ID (para videos subidos)
await meta.sendWhatsAppVideoById(phone, mediaId, 'Caption');
```

---

## Flujo Bridge (Chat Directo)

```
1. CEO/Vendedor: "bridge Juan"
2. SARA activa bridge por 6 minutos
3. Mensajes del equipo → se reenvían al lead
4. Mensajes del lead → se reenvían al equipo
5. "#cerrar" → termina bridge
6. "#mas" → extiende 6 minutos más
```

### NO reenviar al lead:
- Comandos: `bridge`, `cerrar`, `#cerrar`, `#mas`
- Mensajes que empiezan con `/` o `#`

---

## Manejo de Errores

```typescript
try {
  await meta.sendWhatsAppMessage(phone, mensaje);
} catch (error) {
  if (error.message?.includes('rate limit')) {
    // Esperar y reintentar
    await sleep(1000);
    await meta.sendWhatsAppMessage(phone, mensaje);
  } else if (error.message?.includes('invalid phone')) {
    // Marcar lead como teléfono inválido
    await supabase.from('leads').update({ phone_valid: false }).eq('phone', phone);
  }
  // Siempre loguear
  console.error('Error enviando WhatsApp:', error);
}
```

---

## Tests Relacionados

| Archivo | Tests | Qué cubre |
|---------|-------|-----------|
| `conversationLogic.test.ts` | 35 | GPS, recursos, bridge |
| `vendorCommands.test.ts` | 30 | Comandos de vendedor |
| `ceoCommands.test.ts` | 27 | Comandos de CEO |
