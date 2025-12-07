# 🔧 FIXES PARA SARA - EDITAR MANUALMENTE EN VSCODE

## FIX 1: NOTIFICACIÓN ASESOR CON DATOS COMPLETOS

1. Abre: `src/handlers/whatsapp.ts`
2. Ve a la **línea 364**
3. Busca esta línea:
```
`🏦 Nueva solicitud hipotecaria!\n\n👤 ${clientName}\n📱 ${cleanPhone}\n🏠 ${matchedProperty?.name}\n💰 Ingreso: $${mortgageData.monthly_income?.toLocaleString()}/mes\n\n¡Contactar pronto!`
```

4. Reemplázala con esto (COPIA TODO):
```
`🏦 Nueva solicitud hipotecaria!\n\n👤 ${clientName}\n📱 ${cleanPhone}\n🏠 ${matchedProperty?.name || 'Por definir'}\n💰 Ingreso: $${(mortgageInsert.data?.monthly_income || 0).toLocaleString()}/mes\n💳 Deudas: $${(mortgageInsert.data?.current_debt || 0).toLocaleString()}\n🏦 Enganche: $${(mortgageInsert.data?.down_payment || 0).toLocaleString()}\n\n¡Contactar pronto!`
```

---

## FIX 2: ELIMINAR DUPLICADOS VENDEDORES

1. En el mismo archivo: `src/handlers/whatsapp.ts`
2. Ve a las **líneas 367-374**
3. Agrega `//` al inicio de cada línea para comentarlas

ANTES:
```typescript
          for (const v of vendedores) {
            if (v.phone) {
              await this.twilio.sendWhatsAppMessage(
                'whatsapp:' + v.phone,
                `🏦 ${clientName} necesita crédito hipotecario\n🏠 ${matchedProperty?.name}\nAsesor: ${assignedAsesor?.name || 'Sin asignar'}`
              );
            }
          }
```

DESPUÉS:
```typescript
          // for (const v of vendedores) {
          //   if (v.phone) {
          //     await this.twilio.sendWhatsAppMessage(
          //       'whatsapp:' + v.phone,
          //       `🏦 ${clientName} necesita crédito hipotecario\n🏠 ${matchedProperty?.name}\nAsesor: ${assignedAsesor?.name || 'Sin asignar'}`
          //     );
          //   }
          // }
```

---

## DESPUÉS DE EDITAR:
```bash
npm run deploy
```
