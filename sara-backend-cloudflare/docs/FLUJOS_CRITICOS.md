# FLUJOS CRÍTICOS DE SARA - NUNCA ROMPER

> **Este documento define los flujos que DEBEN funcionar SIEMPRE.**
> Si alguno falla, el sistema está roto. NO deployar sin verificar.
> Última actualización: 2026-02-06

---

## HORARIO COMPLETO DE MENSAJES - CUÁNDO SARA MANDA QUÉ A QUIÉN

> **ESTA ES LA SECCIÓN MÁS IMPORTANTE.** Si un mensaje no se manda a su hora, el flujo está roto.
> Todas las horas son México (UTC-6). La condición técnica es `mexicoHour` + `isFirstRunOfHour` (minuto :00).

### TIMELINE DIARIO LUNES A VIERNES

```
 7:55 AM ──── REACTIVAR VENTANAS 24H
              A quién: Team members inactivos 24h+
              Template: reactivar_equipo
              Condición: mexicoHour===7, minuto>=55, L-V
              Por qué: Abrir ventana ANTES del briefing de 8 AM

 8:00 AM ──── BRIEFING MATUTINO VENDEDORES
              A quién: 9 vendedores activos
              Template (cerrada): briefing_matutino [nombre, citas, leads, tip]
              Directo (abierta): Mensaje completo con citas del día
              Condición: mexicoHour===8, L-V
              Función: enviarBriefingMatutino()
              CRON: 0 14 * * 1-5

 8:00 AM ──── REPORTE DIARIO CEO
              A quién: Oscar (CEO) + admins
              Método: Directo (siempre)
              Condición: mexicoHour===8, isFirstRunOfHour, L-V
              Función: enviarReporteDiarioConsolidadoCEO()

 8:00 AM ──── ALERTAS PROACTIVAS CEO
              A quién: Oscar (CEO) + admins
              Método: Directo (siempre)
              Condición: mexicoHour===8, isFirstRunOfHour, L-V
              Función: enviarAlertasProactivasCEO()

 9:00 AM ──── CUMPLEAÑOS + ANIVERSARIOS
              A quién: Leads/equipo que cumplen años + aniversarios de compra
              Método: Mensaje directo al lead, felicitación al equipo
              Condición: mexicoHour===9, isFirstRunOfHour, diario
              Función: felicitarCumpleañosLeads(), felicitarCumpleañosEquipo(),
                       felicitarAniversarioCompra()

10:00 AM ──── ALERTAS LEADS FRÍOS
              A quién: Vendedores con leads fríos (14+ días)
              Método: Alerta directa al vendedor
              Condición: mexicoHour===10, isFirstRunOfHour, L-V
              Función: enviarAlertasLeadsFrios()

10:00 AM ──── STATUS LEADS ESTANCADOS
              A quién: Vendedores con leads sin avance 14+ días
              Método: Pregunta al vendedor "¿Qué pasa con [lead]?"
              Condición: mexicoHour===10, isFirstRunOfHour, L-V
              Función: approvalService.pedirStatusLeadsEstancados()

10:00 AM ──── RECORDATORIOS PAGO APARTADO
              A quién: Leads con apartado (5 días, 1 día, día de pago)
              Método: Mensaje al lead
              Condición: mexicoHour===10, isFirstRunOfHour, diario
              Función: recordatoriosPagoApartado()

10:00 AM ──── SEGUIMIENTO POST-VENTA (30/60/90 días)
              A quién: Clientes vendidos hace 30, 60 o 90 días
              Método: Mensaje al cliente
              Condición: mexicoHour===10, isFirstRunOfHour, diario
              Función: seguimientoPostVenta()

10:00 AM ──── ENCUESTAS NPS
 + 4 PM       A quién: Leads 7-30 días post-visita/compra
              Método: Mensaje "Del 0 al 10, ¿nos recomendarías?"
              Condición: mexicoHour===10, isFirstRunOfHour, L-V
              Función: enviarEncuestasNPS()

10:00 AM ──── FOLLOW-UP 24H LEADS NUEVOS
 + 4 PM       A quién: Leads nuevos sin respuesta en 24h
              Método: Mensaje personalizado al lead
              Condición: mexicoHour===10 || 16, isFirstRunOfHour, L-V
              Función: followUp24hLeadsNuevos()

11:00 AM ──── FOLLOW-UP LEADS INACTIVOS (3+ días)
              A quién: Leads sin actividad 3+ días
              Método: Mensaje re-engagement al lead
              Condición: mexicoHour===11, isFirstRunOfHour, L-V
              Función: followUpLeadsInactivos()

11:00 AM ──── REMINDER DOCUMENTOS CRÉDITO
              A quién: Leads con docs pendientes 3+ días
              Método: Recordatorio al lead
              Condición: mexicoHour===11, isFirstRunOfHour, L-V
              Función: reminderDocumentosCredito()

11:00 AM ──── ALERTA INACTIVIDAD VENDEDORES
              A quién: Admins (cuando vendedor no usa SARA)
              Método: Alerta directa
              Condición: mexicoHour===11, isFirstRunOfHour, L-V
              Función: alertaInactividadVendedor()

11:00 AM ──── LLAMADAS SEGUIMIENTO POST-VISITA (Retell)
              A quién: Leads 1 día post-visita (por teléfono)
              Método: Llamada automática Retell.ai
              Condición: mexicoHour===11, isFirstRunOfHour, L-V
              Función: llamadasSeguimientoPostVisita()

11:00 AM ──── RE-ENGAGEMENT DIRECTO LEADS FRÍOS
 + 5 PM       A quién: Leads fríos (día 3, 7, 14 sin respuesta)
              Método: Mensaje directo al lead (L-S, incluye sábado)
              Condición: mexicoHour===11 || 17, isFirstRunOfHour, L-S
              Función: reengagementDirectoLeads()

12:00 PM ──── SEGUIMIENTO CRÉDITO ESTANCADO
              A quién: Leads con crédito sin avance
              Método: Mensaje al lead
              Condición: mexicoHour===12, isFirstRunOfHour, L-V
              Función: seguimientoCredito()

 2:00 PM ──── ALERTA LEADS HOT SIN CONTACTAR
              A quién: Vendedores con leads HOT no contactados hoy
              Método: Alerta urgente al vendedor
              Condición: mexicoHour===14, isFirstRunOfHour, L-V
              Función: alertaLeadsHotUrgentes()

 3:00 PM ──── RECUPERACIÓN ABANDONOS CRÉDITO
              A quién: Leads que abandonaron proceso de crédito
              Método: Mensaje al lead
              Condición: mexicoHour===15, isFirstRunOfHour, L-V
              Función: recuperarAbandonosCredito()

 4:00 PM ──── FOLLOW-UP POST-VISITA
              A quién: Leads que visitaron pero no avanzaron
              Método: Mensaje al lead
              Condición: mexicoHour===16, isFirstRunOfHour, L-V
              Función: followUpPostVisita()

 5:00 PM ──── RECORDATORIO FINAL DEL DÍA
              A quién: Vendedores con pendientes
              Método: Lista de tareas pendientes
              Condición: mexicoHour===17, isFirstRunOfHour, L-V
              Función: recordatorioFinalDia()

 5:00 PM ──── LLAMADAS RECORDATORIO CITA MAÑANA (Retell)
              A quién: Leads con cita mañana (por teléfono)
              Método: Llamada automática Retell.ai
              Condición: mexicoHour===17, isFirstRunOfHour, L-V
              Función: llamadasRecordatorioCita()

 7:00 PM ──── REPORTE DIARIO VENDEDORES
              A quién: 9 vendedores activos
              Template (cerrada): reporte_vendedor [nombre, nuevos, completadas, total, pipeline, insight]
              Directo (abierta): Reporte completo del día
              Condición: mexicoHour===19, isFirstRunOfHour, L-V
              Función: enviarReporteDiarioVendedores()
              CRON: 0 1 * * *

 7:00 PM ──── REPORTE DIARIO ASESORES
              A quién: 2 asesores hipotecarios
              Template (cerrada): reporte_asesor [nombre, solicitudes, aprobadas, pipeline]
              Directo (abierta): Reporte completo del día
              Condición: mexicoHour===19, isFirstRunOfHour, L-V
              Función: enviarReporteDiarioAsesores()

 7:00 PM ──── REPORTE DIARIO MARKETING
              A quién: Agencia de marketing
              Método: Directo
              Condición: mexicoHour===19, isFirstRunOfHour, L-V
              Función: enviarReporteDiarioMarketing()
```

### MENSAJES POR DÍA ESPECÍFICO

```
LUNES:
├── 8 AM  → Reporte semanal CEO (enviarReporteSemanalCEO)
├── 9 AM  → Reporte semanal vendedores (enviarReporteSemanalVendedores)
├── 9 AM  → Reporte semanal asesores (enviarReporteSemanalAsesores)
├── 9 AM  → Reporte semanal marketing (enviarReporteSemanalMarketing)
└── 10 AM → Seguimiento post-entrega (Lun+Jue)

MARTES:
├── 8 AM  → Seguimiento hipotecas estancadas (Mar+Jue)
├── 10 AM → Coaching vendedores IA (Mar+Jue)
├── 10 AM → Llamadas reactivación leads fríos Retell (Mar+Jue)
└── 11 AM → Encuesta satisfacción casa (3-6 meses post-delivered)
            └── Martes 11 AM → encuestaSatisfaccionCasa()

MIÉRCOLES:
├── 8 AM  → Remarketing leads fríos (remarketingLeadsFrios)
└── 11 AM → Solicitar referidos (30-90 días post-venta)
            └── Miércoles 11 AM → solicitarReferidos()

JUEVES:
├── 8 AM  → Seguimiento hipotecas estancadas (Mar+Jue)
├── 10 AM → Coaching vendedores IA (Mar+Jue)
├── 10 AM → Llamadas reactivación leads fríos Retell (Mar+Jue)
├── 10 AM → Seguimiento post-entrega (Lun+Jue)
└── 11 AM → Nurturing educativo (Mar+Jue)

VIERNES:
└── 10 AM → Encuestas NPS (semanal adicional)

SÁBADO:
├── 10 AM → Check-in mantenimiento (~1 año post-delivered)
│           └── checkInMantenimiento()
├── 11 AM + 5 PM → Re-engagement directo (también sábados)
├── 2 PM  → Recap semanal vendedores (enviarRecapSemanal)
└── 2 PM  → Video semanal de logros Veo 3 (generarVideoSemanalLogros)

1ER LUNES DEL MES:
└── 10 AM → Reactivar leads perdidos 30+ días (reactivarLeadsPerdidos)

DÍA 1 DE CADA MES:
├── 12 AM → Aplicar precios programados (aplicarPreciosProgramados)
├── 8 AM  → Reporte mensual CEO (enviarReporteMensualCEO)
├── 9 AM  → Reporte mensual vendedores (enviarReporteMensualVendedores)
├── 9 AM  → Reporte mensual asesores (enviarReporteMensualAsesores)
└── 9 AM  → Reporte mensual marketing (enviarReporteMensualMarketing)
```

### MENSAJES CONTINUOS (CADA 2 MINUTOS, 24/7)

```
SIEMPRE (cada ejecución del CRON */2):
├── Recordatorios de citas (24h y 2h antes del appointment)
│   └── A quién: Lead con cita → "Tu cita es mañana/en 2 horas"
├── Encuestas post-cita (2-24h después de cita completada)
│   └── A quién: Lead que visitó → "¿Cómo fue tu experiencia? (1-4)"
├── Follow-ups automáticos pendientes (scheduled_followups table)
│   └── A quién: Leads con follow-up programado cuya hora ya pasó
├── Propuestas de follow-up a vendedores
│   └── A quién: Vendedor → "¿Envío este mensaje a [lead]? SI/NO"
├── Detectar no-shows (citas pasadas sin marcar completed)
│   └── A quién: Lead no-show → template reagendar_noshow
├── Pre-no-show alert (citas en 2h sin confirmar)
│   └── A quién: Vendedor → "Cita de [lead] en 2h, no ha confirmado"
├── Timeout confirmaciones vendedor
│   └── Si vendedor no responde propuesta en 4h → auto-enviar
├── Flujo post-visita (30-90min después de cita completada)
│   └── A quién: Lead → "¿Qué te pareció [desarrollo]?"
└── Videos pendientes Veo 3 (verificar si ya se generaron)
    └── A quién: Lead → enviar video personalizado cuando esté listo

CADA 30 MINUTOS (minuto :00 y :30):
└── Verificar pending messages para llamar (Retell)
    └── A quién: Team members con pending 2h+ sin respuesta
    └── Método: Llamada telefónica automática
    └── Solo 9AM-8PM México, máx 2 llamadas/día

CADA HORA (9am-7pm L-V):
└── Re-engagement leads sin respuesta 48h+
    └── A quién: Leads sin actividad → verificarReengagement()

CADA 2 HORAS (8am-8pm):
├── Lead scoring automático → actualizarLeadScores()
└── Video bienvenida leads nuevos (Veo 3) → videoBienvenidaLeadNuevo()
```

### RESUMEN VISUAL: QUIÉN RECIBE QUÉ

```
┌───────────────────────────────────────────────────────────────────┐
│                    VENDEDORES (9)                                  │
├───────────────────────────────────────────────────────────────────┤
│ 7:55 AM  │ Template reactivar_equipo (si ventana cerrada)        │
│ 8:00 AM  │ Briefing matutino (template briefing_matutino)        │
│ 10:00 AM │ Alertas leads fríos + status estancados               │
│ 2:00 PM  │ Alerta leads HOT sin contactar                        │
│ 5:00 PM  │ Recordatorio final del día                            │
│ 7:00 PM  │ Reporte diario (template reporte_vendedor)            │
│ Lunes    │ Reporte semanal                                       │
│ Sábado   │ Recap semanal (2 PM)                                  │
│ Día 1    │ Reporte mensual                                       │
│ Mar/Jue  │ Coaching IA (10 AM)                                   │
│ Continuo │ Propuestas de follow-up, alertas leads calientes      │
└───────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────┐
│                    CEO / ADMINS                                    │
├───────────────────────────────────────────────────────────────────┤
│ 8:00 AM  │ Reporte diario consolidado + alertas proactivas       │
│ Lunes    │ Reporte semanal CEO                                   │
│ Día 1    │ Reporte mensual CEO                                   │
│ Continuo │ Alertas inactividad vendedores (11 AM)                │
└───────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────┐
│                    ASESORES (2)                                    │
├───────────────────────────────────────────────────────────────────┤
│ 7:00 PM  │ Reporte diario (template reporte_asesor)              │
│ Lunes    │ Reporte semanal asesores                              │
│ Día 1    │ Reporte mensual asesores                              │
│ Mar/Jue  │ Seguimiento hipotecas estancadas (8 AM)               │
└───────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────┐
│                    MARKETING / AGENCIA                             │
├───────────────────────────────────────────────────────────────────┤
│ 7:00 PM  │ Reporte diario marketing                              │
│ Lunes    │ Reporte semanal marketing                             │
│ Día 1    │ Reporte mensual marketing                             │
└───────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────┐
│                    LEADS / CLIENTES                                │
├───────────────────────────────────────────────────────────────────┤
│ Instantáneo │ Respuesta IA cuando escriben                       │
│ +30-90 min  │ Flujo post-visita después de cita                  │
│ +2h         │ Encuesta post-cita                                 │
│ +24h        │ Follow-up si no respondió                          │
│ +3 días     │ Follow-up leads inactivos                          │
│ +7 días     │ Re-engagement directo                              │
│ +14 días    │ Re-engagement fuerte                               │
│ +21 días    │ Lead marcado frío → remarketing                    │
│ 24h antes   │ Recordatorio de cita                               │
│ 2h antes    │ Recordatorio urgente de cita                       │
│ 9 AM        │ Felicitación cumpleaños / aniversario              │
│ 10 AM       │ Follow-up 24h nuevos + NPS + recordatorio apartado │
│ 4 PM        │ Follow-up 24h nuevos (segundo intento)             │
│ Post-compra │ NPS, referidos, satisfacción, mantenimiento        │
└───────────────────────────────────────────────────────────────────┘
```

### CONDICIÓN TÉCNICA EN index.ts (scheduled handler)

Toda la lógica de timing vive en `src/index.ts` líneas ~17226-17899.
Las funciones se llaman desde ahí pero se implementan en `src/crons/*.ts`.

```typescript
// Cómo funciona el timing:
const mexicoHour = new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City', hour: 'numeric', hour12: false });
const mexicoMinute = ...; // minuto actual en México
const isFirstRunOfHour = mexicoMinute === 0; // Solo ejecutar 1 vez por hora
const dayOfWeek = ...; // 0=Dom, 1=Lun...6=Sáb

// Ejemplo: Briefing a las 8 AM México L-V
if (mexicoHour === 8 && dayOfWeek >= 1 && dayOfWeek <= 5) {
  await enviarBriefingMatutino(...); // Procesa en batches
}

// Ejemplo: Alertas leads fríos a las 10 AM L-V (solo 1 vez)
if (mexicoHour === 10 && isFirstRunOfHour && dayOfWeek >= 1 && dayOfWeek <= 5) {
  await enviarAlertasLeadsFrios(...);
}
```

**IMPORTANTE:** `isFirstRunOfHour` (minuto === 0) evita que las tareas horarias se ejecuten 30 veces por hora (cada 2 min). Sin esto, un vendedor recibiría 30 briefings en vez de 1.

---

## DIAGRAMA GENERAL DEL SISTEMA

```
                        ┌─────────────────────────────────────────┐
                        │           CLOUDFLARE WORKERS             │
                        │         sara-backend.edson-633           │
                        │                                         │
  ┌──────────┐          │  ┌───────────┐    ┌──────────────────┐  │
  │  META    │──webhook─│─►│ fetch()   │───►│ Router           │  │
  │ WhatsApp │◄─────────│──│ handler   │    │  /webhook/meta   │  │
  └──────────┘          │  └───────────┘    │  /api/*          │  │
                        │                    │  /test-*         │  │
  ┌──────────┐          │  ┌───────────┐    └──────────────────┘  │
  │ CRON     │──trigger─│─►│scheduled()│                          │
  │ Triggers │          │  │ handler   │───►┌──────────────────┐  │
  └──────────┘          │  └───────────┘    │ 3 CRONs:         │  │
                        │                    │ */2 * * * *      │  │
  ┌──────────┐          │                    │ 0 14 * * 1-5     │  │
  │ Supabase │◄────────►│  (PostgreSQL)      │ 0 1 * * *        │  │
  └──────────┘          │                    └──────────────────┘  │
                        │                                         │
  ┌──────────┐          │                    ┌──────────────────┐  │
  │ Claude   │◄────────►│  (IA)              │ KV Cache         │  │
  │ Anthropic│          │                    │ SARA_CACHE       │  │
  └──────────┘          │                    └──────────────────┘  │
                        │                                         │
  ┌──────────┐          │                    ┌──────────────────┐  │
  │ Retell   │◄────────►│  (Llamadas)        │ Google Calendar  │  │
  └──────────┘          │                    └──────────────────┘  │
                        └─────────────────────────────────────────┘
```

---

## FLUJO 1: MENSAJE DE LEAD (CRÍTICO #1)

**Si esto falla:** Los leads no reciben respuesta → se pierden ventas.

```
WhatsApp → POST /webhook/meta
│
├── 1. DEDUPLICACIÓN ────────────────────── Si duplicado → return 200
│   └── Verifica messageId en notes.last_processed_msg_id
│
├── 2. IDENTIFICAR REMITENTE
│   ├── Limpiar teléfono (normalizar 521XXXXXXXXXX)
│   ├── ¿Es team_member? → FLUJO 2 (equipo)
│   └── ¿Es lead? → continuar aquí
│
├── 3. VERIFICAR ENCUESTAS PENDIENTES ──── ANTES de cualquier otra cosa
│   ├── NPS (0-10) → procesarRespuestaNPS()
│   ├── Post-entrega → procesarRespuestaEntrega()
│   ├── Satisfacción casa → procesarRespuestaSatisfaccionCasa()
│   └── Mantenimiento → procesarRespuestaMantenimiento()
│   └── Si procesó encuesta → return (NO pasar a IA)
│
├── 4. MULTIMEDIA
│   ├── Audio 🎤 → Transcribir con Whisper → procesar como texto
│   ├── Imagen 🖼️ → ¿Post-entrega + desperfecto? → notificar equipo
│   ├── Sticker → "¡Me encanta! ¿Buscas casa?"
│   ├── Ubicación 📍 → Analizar zona + casas cercanas
│   ├── Video/Documento → "Prefiero texto"
│   ├── Contacto → "¿Le escribo o le das mi número?"
│   ├── Reacción → Log silencioso
│   └── Emoji solo → Respuesta contextual por tipo
│
├── 5. ¿BRIDGE ACTIVO? ─────────────────── Si bridge → reenviar a vendedor
│
├── 6. IA CONVERSACIONAL ──────────────────── CORAZÓN DEL SISTEMA
│   ├── AIConversationService.analyzeWithAI()
│   │   ├── Detectar fase (Discovery→Qualification→Presentation→Closing→Nurturing)
│   │   ├── Cargar contexto: preferencias, objeciones, historial (15 acciones)
│   │   ├── Cargar propiedades de Supabase
│   │   ├── Llamar a Claude con prompt completo
│   │   └── Post-procesamiento:
│   │       ├── Corregir nombres alucinados
│   │       ├── Corregir alberca (solo Andes)
│   │       ├── Corregir Citadella/Colinas del Padre
│   │       ├── Corregir renta ("solo vendemos")
│   │       ├── Enforcement de nombre (máx 3 intentos)
│   │       ├── Corregir nombre como ubicación
│   │       └── Safety nets (no contacto, ya compró, etc.)
│   │
│   └── Resultado: { response, intent, gps, brochure, video, appointment }
│
├── 7. ENVIAR RESPUESTA
│   ├── Texto de SARA → meta.sendWhatsAppMessage()
│   ├── Si gps=true → meta.sendWhatsAppLocation() o sendWhatsAppMessage(gps_link)
│   ├── Si brochure=true → meta.sendWhatsAppDocument() o sendWhatsAppMessage(brochure_url)
│   ├── Si video=true → meta.sendWhatsAppVideo()
│   └── Si appointment → crear en Supabase + Google Calendar
│
└── 8. ACTUALIZAR LEAD
    ├── Actualizar last_message_at
    ├── Actualizar score
    ├── Guardar en conversation_history
    ├── Guardar preferencias en notes (desarrollos_interes, recamaras, etc.)
    └── Actualizar status si cambió
```

**VERIFICAR CON:**
```bash
# Test rápido (no envía WhatsApp)
curl "https://sara-backend.edson-633.workers.dev/test-ai-response?msg=hola+busco+casa&api_key=XXX"

# Test real (SÍ envía WhatsApp al teléfono de prueba)
curl "https://sara-backend.edson-633.workers.dev/test-lead?phone=5610016226&name=Test&msg=hola&api_key=XXX"
```

---

## FLUJO 2: MENSAJE DE EQUIPO (CRÍTICO #2)

**Si esto falla:** Vendedores/CEO no pueden usar SARA → operación paralizada.

```
WhatsApp → POST /webhook/meta
│
├── 1. DEDUPLICACIÓN TEAM ──────────────── Verifica last_processed_msg_id en team_members.notes
│
├── 2. IDENTIFICAR ROL
│   ├── admin/coordinador → handleCEOMessage()
│   ├── vendedor → handleVendedorMessage()
│   ├── asesor → handleAsesorMessage()
│   └── agencia → handleAgenciaMessage()
│
├── 3. ⚠️ VERIFICAR PENDING PRIMERO ────── ANTES de comandos o bridge
│   │   (Si no se hace → mensajes pending nunca se entregan)
│   │
│   ├── pending_briefing → Entregar briefing + limpiar
│   ├── pending_recap → Entregar recap + limpiar
│   ├── pending_reporte_diario → Entregar reporte + limpiar
│   ├── pending_resumen_semanal → Entregar resumen + limpiar
│   │
│   ├── Verificar isPendingExpired() antes de entregar
│   ├── Actualizar last_sara_interaction (abre ventana 24h)
│   └── return (NO procesar comando después de entregar pending)
│
├── 4. ¿BRIDGE ACTIVO? ─────────────────── Si bridge → reenviar al lead
│
├── 5. ¿SUGERENCIA PENDIENTE? ──────────── Si alerta con sugerencia
│   ├── "ok"/"si" → enviar mensaje sugerido al lead
│   └── Mensaje custom → enviar eso al lead
│
├── 6. PARSEAR COMANDO
│   │
│   ├── CEO: equipo, ventas, pipeline, alertas, mercado, clv, calcular,
│   │        bancos, comparar, broadcast, adelante/atrás, asignar...
│   │
│   ├── Vendedor: mis leads, citas, hot, pendientes, meta, agendar,
│   │            reagendar, cancelar, nota, bridge, cotizar, ofertas...
│   │
│   ├── Asesor: mis leads, docs, preaprobado, rechazado, contactado...
│   │
│   └── Marketing: campañas, metricas, segmentos, broadcast...
│
└── 7. EJECUTAR Y RESPONDER
    └── meta.sendWhatsAppMessage(teamMember.phone, respuesta)
```

**VERIFICAR CON:**
```bash
# Simular comando de vendedor/CEO
curl "https://sara-backend.edson-633.workers.dev/test-vendedor-msg?phone=5212224558475&msg=mis+leads&api_key=XXX"
```

---

## FLUJO 3: ENVÍO A EQUIPO - VENTANA 24H (CRÍTICO #3)

**Si esto falla:** Briefings y reportes no llegan → equipo sin información.

```
enviarMensajeTeamMember(supabase, meta, teamMember, mensaje, opciones)
│
├── 1. VERIFICAR VENTANA 24H
│   ├── Leer last_sara_interaction de notes
│   └── ¿Dentro de 24h? → ABIERTA / CERRADA
│
├── 2A. VENTANA ABIERTA ────────────────────────────────────────────
│   ├── Enviar mensaje DIRECTO → meta.sendWhatsAppMessage()
│   ├── Si TTS habilitado → enviar voice note también
│   └── return { success: true, method: 'direct' }
│
├── 2B. VENTANA CERRADA + PRIORIDAD CRÍTICA ────────────────────────
│   ├── Llamar INMEDIATAMENTE con Retell.ai
│   └── return { success: true, method: 'call' }
│
├── 2C. VENTANA CERRADA + PRIORIDAD NORMAL ─────────────────────────
│   │
│   ├── PASO 1: Enviar TEMPLATE con datos reales
│   │   ├── ¿templateOverride existe?
│   │   │   ├── SÍ → usar template específico con params
│   │   │   │   ├── briefing_matutino → [nombre, citas, leads, tip]
│   │   │   │   ├── reporte_vendedor → [nombre, nuevos, completadas, total, pipeline, insight]
│   │   │   │   └── reporte_asesor → [nombre, solicitudes, aprobadas, pipeline]
│   │   │   │
│   │   │   └── NO → usar template genérico reactivar_equipo
│   │   │
│   │   └── meta.sendTemplate(phone, templateName, 'es_MX', components)
│   │
│   ├── PASO 2: Guardar mensaje como PENDING
│   │   ├── Calcular expires_at según tipo:
│   │   │   ├── briefing: 18h
│   │   │   ├── recap: 18h
│   │   │   ├── reporte_diario: 24h
│   │   │   ├── resumen_semanal: 72h
│   │   │   └── notificacion: 48h
│   │   │
│   │   └── Guardar en notes: { pending_KEY: { sent_at, mensaje_completo, expires_at } }
│   │
│   └── PASO 3: CRON verificará después de 2h → LLAMAR si no respondió
│       ├── verificarPendingParaLlamar() cada 30 min
│       ├── Solo en horario 9AM-8PM México
│       ├── Máximo 2 llamadas/día por persona
│       └── Llamar via Retell.ai
│
└── 2D. VENTANA CERRADA + PRIORIDAD BAJA ──────────────────────────
    ├── Solo template, NUNCA llamar
    └── return { success: true, method: 'template' }
```

**VERIFICAR CON:**
```bash
# Ver estado de ventanas 24h
curl "https://sara-backend.edson-633.workers.dev/test-ventana-24h?api_key=XXX"

# Probar envío a vendedor específico
curl "https://sara-backend.edson-633.workers.dev/test-envio-7pm?enviar=true&phone=5212224558475&api_key=XXX"
```

---

## FLUJO 4: CRONs PROGRAMADOS (CRÍTICO #4)

**Si esto falla:** No hay briefings, reportes, follow-ups → equipo a ciegas.

```
┌─────────────────────────────────────────────────────────────────────┐
│ CRON 1: */2 * * * *  (Cada 2 minutos, 24/7)                        │
│                                                                     │
│ Ejecuta basándose en mexicoHour (UTC-6):                            │
│                                                                     │
│ CADA EJECUCIÓN:                                                     │
│ ├── Recordatorios de citas (24h y 2h antes)                         │
│ ├── Encuestas post-cita (2-24h después)                             │
│ ├── Follow-ups automáticos pendientes                               │
│ ├── Propuestas follow-up a vendedores                               │
│ ├── Detectar no-shows                                               │
│ ├── Pre-no-show alert (citas en 2h sin confirmar)                   │
│ ├── Timeout confirmaciones vendedor                                 │
│ ├── Flujo post-visita (30-90min después de cita)                    │
│ └── Videos pendientes Veo 3                                         │
│                                                                     │
│ CADA 30 MIN (minuto :00 y :30):                                     │
│ └── Verificar pending para llamar (Retell)                          │
│                                                                     │
│ CADA HORA (9am-7pm L-V):                                            │
│ └── Re-engagement leads sin respuesta 48h+                          │
│                                                                     │
│ CADA 2 HORAS (8am-8pm):                                             │
│ └── Lead scoring automático                                         │
│                                                                     │
│ HORARIOS FIJOS L-V:                                                 │
│ ├── 9 AM  → Cumpleaños leads + equipo + aniversarios                │
│ ├── 10 AM → Alertas leads fríos, status estancados, recordatorios   │
│ ├── 10 AM + 4 PM → Follow-up 24h leads nuevos                      │
│ ├── 11 AM → Follow-up leads inactivos, reminder docs crédito        │
│ ├── 11 AM + 5 PM → Re-engagement directo leads fríos (L-S)         │
│ ├── 12 PM → Seguimiento crédito estancado                           │
│ ├── 2 PM  → Alerta leads HOT sin contactar hoy                     │
│ ├── 3 PM  → Recuperación abandonos crédito                          │
│ ├── 4 PM  → Follow-up post-visita                                   │
│ └── 5 PM  → Recordatorio final del día                              │
│                                                                     │
│ DÍAS ESPECÍFICOS:                                                   │
│ ├── Mar/Jue 8 AM  → Seguimiento hipotecas                          │
│ ├── Miércoles 8 AM → Remarketing leads fríos                       │
│ ├── Mar/Jue 10 AM → Coaching vendedores                            │
│ ├── Mar/Jue 11 AM → Nurturing educativo                            │
│ ├── Martes 11 AM  → Encuesta satisfacción casa                     │
│ ├── Miércoles 11 AM → Solicitar referidos                          │
│ ├── Viernes 10 AM → Encuestas NPS                                  │
│ ├── Lun/Jue 10 AM → Seguimiento post-entrega                      │
│ ├── Sábado 10 AM  → Check-in mantenimiento                         │
│ └── 1er Lunes mes 10 AM → Reactivar leads perdidos                 │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ CRON 2: 0 14 * * 1-5  (8 AM México, Lunes a Viernes)               │
│                                                                     │
│ SIEMPRE (L-V):                                                      │
│ ├── 7:55 AM → Reactivar ventanas 24h (template reactivar_equipo)   │
│ ├── 8:00 AM → Briefing matutino vendedores (template briefing_mat.) │
│ ├── 8:00 AM → Reporte diario consolidado CEO (directo)              │
│ └── 8:00 AM → Alertas proactivas CEO (directo)                     │
│                                                                     │
│ LUNES:                                                              │
│ ├── 8 AM → Reporte semanal CEO                                     │
│ └── 9 AM → Reportes semanales vendedores/asesores/marketing        │
│                                                                     │
│ DÍA 1 DEL MES:                                                     │
│ ├── 8 AM → Reporte mensual CEO                                     │
│ └── 9 AM → Reportes mensuales vendedores/asesores/marketing        │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ CRON 3: 0 1 * * *  (7 PM México, Diario)                           │
│                                                                     │
│ SIEMPRE:                                                            │
│ ├── 7 PM → Reporte diario vendedores (template reporte_vendedor)    │
│ ├── 7 PM → Reporte diario asesores (template reporte_asesor)        │
│ ├── 7 PM → Reporte diario marketing (directo)                      │
│ └── Backup diario (KV)                                              │
│                                                                     │
│ SÁBADO:                                                             │
│ ├── 2 PM → Recap semanal vendedores                                │
│ └── 2 PM → Video semanal de logros (Veo 3)                         │
└─────────────────────────────────────────────────────────────────────┘
```

**VERIFICAR CON:**
```bash
# Health check incluye estado de CRONs
curl "https://sara-backend.edson-633.workers.dev/health"

# Logs en tiempo real
npx wrangler tail --format=pretty
```

---

## FLUJO 5: ENTREGA DE PENDING (CRÍTICO #5)

**Si esto falla:** El equipo responde al template pero nunca recibe el mensaje real.

```
Team member responde a template de reactivación
│
├── 1. Webhook llega a /webhook/meta
│
├── 2. Identificar como team_member
│
├── 3. ⚠️ VERIFICAR PENDING (PRIMERO, ANTES DE TODO)
│   │
│   │   ORDEN DE VERIFICACIÓN:
│   │   ├── 1° pending_briefing (prioridad 1)
│   │   ├── 2° pending_recap (prioridad 2)
│   │   ├── 3° pending_reporte_diario (prioridad 2)
│   │   ├── 4° pending_resumen_semanal (prioridad 3)
│   │   └── 5° pending_mensaje (prioridad 4)
│   │
│   ├── ¿Existe pending?
│   │   ├── SÍ → ¿isPendingExpired()?
│   │   │   ├── NO (vigente) → ENTREGAR mensaje completo
│   │   │   │   ├── meta.sendWhatsAppMessage(phone, mensaje_completo)
│   │   │   │   ├── Limpiar pending de notes
│   │   │   │   ├── Actualizar last_sara_interaction
│   │   │   │   └── return (NO procesar como comando)
│   │   │   │
│   │   │   └── SÍ (expirado) → Limpiar pending, continuar a comandos
│   │   │
│   │   └── NO → Continuar a comandos (Flujo 2)
│   │
│   └── ⚠️ NUNCA procesar el mensaje como comando después de entregar pending
│
└── 4. Si no había pending → procesar como comando normal (Flujo 2)
```

**VERIFICAR CON:**
```bash
# Ver pending activos de cada team member
curl "https://sara-backend.edson-633.workers.dev/test-ventana-24h?api_key=XXX"

# Limpiar pending expirados
curl "https://sara-backend.edson-633.workers.dev/limpiar-pending-expirados?api_key=XXX"
```

---

## FLUJO 6: FOLLOW-UPS AUTOMÁTICOS (CRÍTICO #6)

**Si esto falla:** Leads se enfrían sin seguimiento → se pierden.

```
Lead contactado por primera vez
│
├── 24h sin respuesta → Follow-up paso 1
│   "¡Hola! Ayer hablamos sobre [desarrollo]. ¿Tienes alguna duda?"
│
├── 48h sin respuesta → Re-engagement alert a vendedor
│   "⚠️ [Lead] no ha respondido en 48h"
│
├── 3 días sin respuesta → Follow-up paso 2
│   Mensaje más directo con urgencia/escasez
│
├── 7 días sin respuesta → Follow-up paso 3
│   Mensaje de valor (precio especial, última unidad)
│
├── 14 días sin respuesta → Lead marcado TIBIO
│   Re-engagement directo con mensaje personalizado
│
└── 21+ días sin respuesta → Lead marcado FRÍO
    Remarketing periódico (miércoles)

───────────────────────────────────────────

Post-cita:
│
├── +30-90 min → Flujo post-visita (iniciarFlujosPostVisita)
│   "¿Qué te pareció [desarrollo]?"
│
├── +24h → Follow-up post-visita
│   "¿Tienes dudas sobre lo que viste?"
│
└── +48h → Encuesta post-cita
    "¿Cómo fue tu experiencia? (1-4)"

───────────────────────────────────────────

Post-compra:
│
├── 7-30 días → NPS (0-10)
├── 30-90 días → Solicitar referidos
├── 3-7 días post-entrega → Seguimiento entrega
├── 3-6 meses post-entrega → Satisfacción casa
├── ~1 año → Check-in mantenimiento
└── Cada año → Aniversario de compra
```

---

## FLUJO 7: LEAD SCORING (CRÍTICO #7)

**Si esto falla:** No se priorizan los leads correctos → vendedores pierden tiempo.

```
Lead scoring se ejecuta cada 2 horas (8am-8pm)
│
├── SEÑALES POSITIVAS (suman puntos):
│   ├── +20 → Pidió cita o dijo "quiero ver"
│   ├── +15 → Habló de crédito/INFONAVIT
│   ├── +10 → Preguntó precios específicos
│   ├── +10 → Pidió GPS/ubicación
│   ├── +10 → Pidió brochure
│   ├── +8  → Preguntó por desarrollo específico
│   ├── +5  → Responde rápido (< 1h)
│   └── +3  → Cada mensaje enviado
│
├── SEÑALES NEGATIVAS (restan puntos):
│   ├── -10 → "No me interesa"
│   ├── -5  → "Lo voy a pensar"
│   ├── -3  → No responde en 48h
│   └── -2  → Cada día sin interacción
│
├── CLASIFICACIÓN:
│   ├── 70+ → 🔥 HOT (alerta inmediata a vendedor)
│   ├── 40-69 → ⚡ WARM (seguimiento activo)
│   └── <40 → ❄️ COLD (nurturing automático)
│
└── ACCIONES AUTOMÁTICAS:
    ├── HOT → Alerta a vendedor "🔥 Lead caliente: [nombre]"
    ├── HOT sin contactar hoy (2 PM) → Alerta urgente
    └── COLD (21+ días) → Entra a remarketing
```

---

## CHECKLIST PRE-DEPLOY (OBLIGATORIO)

```bash
# 1. Tests unitarios (351+)
npm test

# 2. Si TODOS pasan → deploy
npx wrangler deploy

# 3. Verificar health
curl https://sara-backend.edson-633.workers.dev/health

# 4. Test rápido de IA
curl "https://sara-backend.edson-633.workers.dev/test-ai-response?msg=hola&api_key=XXX"

# 5. Test de ventana 24h
curl "https://sara-backend.edson-633.workers.dev/test-ventana-24h?api_key=XXX"
```

---

## REGLAS DE ORO (NUNCA ROMPER)

| # | Regla | Por qué |
|---|-------|---------|
| 1 | **Pending se verifica PRIMERO** en handleVendedorMessage y handleCEOMessage | Si no, mensajes pending nunca se entregan |
| 2 | **Deduplicación SIEMPRE** para leads y team_members | Meta envía webhooks duplicados |
| 3 | **Encuestas se procesan ANTES de IA** | Respuestas cortas (1-10) se confunden con emojis |
| 4 | **Ventana 24h SIEMPRE se verifica** antes de enviar al equipo | Mensajes no llegan si ventana cerrada |
| 5 | **templateOverride con datos reales** para briefings y reportes | Template genérico = nadie responde |
| 6 | **Post-procesamiento de IA SIEMPRE activo** | Claude alucina nombres, ubicaciones, albercas |
| 7 | **351+ tests SIEMPRE pasan** antes de deploy | Un test roto = algo se rompió |
| 8 | **Nunca hardcodear Los Encinos como default** | Confunde al lead |
| 9 | **Alberca = SOLO Priv. Andes** | Dato incorrecto = cliente insatisfecho |
| 10 | **Citadella del Nogal = Villa Campelo + Villa Galiano** | NO es un desarrollo independiente |
| 11 | **Colinas del Padre = SOLO casas** (no terrenos) | Terrenos están en Citadella/Guadalupe |
| 12 | **Nombre max 3 intentos** | Más = spam, lead se va |
| 13 | **Números puros (0-10) NO son emojis** | Son respuestas NPS/encuestas |
| 14 | **isPendingExpired() ANTES de entregar** | No entregar mensajes viejos |
| 15 | **Precios EQUIPADOS por default** | Cliente espera precio final |

---

## PUNTOS DE FALLA CONOCIDOS

| Punto | Síntoma | Causa probable | Fix |
|-------|---------|----------------|-----|
| Lead no recibe respuesta | Timeout en logs | Claude API lenta o caída | Verificar ANTHROPIC_API_KEY |
| Equipo no recibe briefing | 0 enviados en logs | Ventana cerrada + template rechazado | Verificar templates en Meta |
| Pending no se entrega | Team member dice "no recibí" | Pending expirado o handler no lo detecta | `/limpiar-pending-expirados` |
| Mensajes duplicados | Lead/equipo recibe 2-3 veces | Deduplicación falló | Verificar `last_processed_msg_id` |
| Score no sube | Lead HOT muestra score bajo | CRON de scoring no ejecuta | Verificar logs cada 2h |
| GPS/brochure no se envía | Lead pide pero no recibe | Property sin `gps_link` o `brochure_urls` | Verificar tabla properties |
| SARA dice info incorrecta | Alberca en Falco, renta, etc. | Post-procesamiento no detectó | Agregar nueva safety net |
| Template rechazado por Meta | Error 132015 en logs | Template no aprobado o params incorrectos | Verificar en `/api/templates` |
| Llamada Retell no sale | Pending sin llamada después de 2h | Fuera de horario o max llamadas | Verificar CALL_CONFIG |

---

## ARCHIVOS QUE IMPLEMENTAN CADA FLUJO

| Flujo | Archivo(s) principal(es) | Líneas clave |
|-------|--------------------------|--------------|
| Mensaje Lead | `src/index.ts` (webhook) + `src/handlers/whatsapp.ts` | index ~800-1200 |
| Mensaje Equipo | `src/handlers/whatsapp.ts` | handleCEOMessage ~1520, handleVendedorMessage ~3810 |
| Ventana 24h | `src/utils/teamMessaging.ts` | enviarMensajeTeamMember ~50-250 |
| Briefing 8AM | `src/crons/briefings.ts` | enviarBriefingMatutino ~310 |
| Reportes 7PM | `src/crons/reports.ts` | enviarReporteDiarioVendedores ~1402, enviarReporteDiarioAsesores ~2017 |
| Follow-ups | `src/crons/followups.ts` | Múltiples funciones |
| Lead scoring | `src/crons/leadScoring.ts` | actualizarLeadScores |
| IA Conversacional | `src/services/aiConversationService.ts` | analyzeWithAI ~400 |
| Post-procesamiento | `src/services/aiConversationService.ts` | ~1900-2500 |
| Encuestas | `src/index.ts` | checkPendingSurveyResponse + procesarRespuestaNPS |
| Post-compra | `src/crons/nurturing.ts` | 6 funciones principales |
| Llamadas Retell | `src/services/retellService.ts` + `src/utils/teamMessaging.ts` | CALL_CONFIG |
| Templates Meta | `src/services/metaWhatsAppService.ts` | sendTemplate |

---

## RESUMEN VISUAL: LOS 7 FLUJOS CRÍTICOS

```
╔═══════════════════════════════════════════════════════════════════╗
║                    SARA - 7 FLUJOS CRÍTICOS                      ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  1. LEAD → IA → RESPUESTA           Si falla: perdemos ventas    ║
║  2. EQUIPO → COMANDO → RESULTADO    Si falla: equipo paralizado  ║
║  3. ENVÍO → VENTANA 24H → TEMPLATE  Si falla: info no llega      ║
║  4. CRONs → TAREAS AUTOMÁTICAS      Si falla: sin automatización ║
║  5. PENDING → ENTREGA               Si falla: mensajes perdidos  ║
║  6. FOLLOW-UPS → NURTURING          Si falla: leads se enfrían   ║
║  7. SCORING → PRIORIZACIÓN          Si falla: vendedores a ciegas║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
```
