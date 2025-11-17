# 🤖 SARA - AI Real Estate Assistant Backend

Backend completo para SARA, el primer CRM inteligente para bienes raíces que responde WhatsApp 24/7.

## 🎯 Funcionalidades

- ✅ **WhatsApp 24/7**: Responde automáticamente a clientes por WhatsApp
- ✅ **Captura de Leads**: Extrae nombre, teléfono y necesidades del cliente
- ✅ **IA Conversacional**: Google Gemini 2.0 Flash para conversaciones naturales
- ✅ **Historial Completo**: Guarda todas las conversaciones en Supabase
- ✅ **CRM Integrado**: Gestión completa de leads y propiedades
- ✅ **Webhooks Twilio**: Recibe y envía mensajes en tiempo real

## 🏗️ Arquitectura

```
Backend (Node.js + TypeScript)
├── Express Server (webhooks)
├── Twilio WhatsApp API (mensajería)
├── Google Gemini AI (conversación)
└── Supabase (base de datos)
```

## 📁 Estructura del Proyecto

```
sara-backend/
├── src/
│   ├── server.ts           # Servidor principal + webhooks
│   ├── geminiService.ts    # Integración Google Gemini AI
│   ├── supabaseService.ts  # Servicio de base de datos
│   ├── twilioService.ts    # Envío de mensajes WhatsApp
│   ├── saraPrompt.ts       # Prompt optimizado de SARA
│   └── types.ts            # TypeScript interfaces
├── schema.sql              # Schema de Supabase
├── package.json
├── tsconfig.json
├── .env.example
├── DEPLOYMENT.md           # Guía de deployment paso a paso
└── README.md
```

## 🚀 Quick Start

### 1. Clonar e instalar

```bash
npm install
```

### 2. Configurar variables de entorno

Copia `.env.example` a `.env` y completa:

```env
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_KEY=tu-anon-key
TWILIO_ACCOUNT_SID=TU_TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN=tu-auth-token
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
GEMINI_API_KEY=tu-gemini-api-key
PORT=3000
```

### 3. Setup de Supabase

1. Crea cuenta en https://supabase.com
2. Crea nuevo proyecto
3. Ejecuta el script `schema.sql` en SQL Editor

### 4. Correr en desarrollo

```bash
npm run dev
```

### 5. Deploy a producción

Lee `DEPLOYMENT.md` para instrucciones completas.

## 🔌 API Endpoints

### Health Check
```bash
GET /health
```

### WhatsApp Webhook
```bash
POST /webhook/whatsapp
```
Recibe mensajes de Twilio y responde automáticamente.

## 📊 Base de Datos (Supabase)

### Tablas principales:

- **leads**: Información de clientes potenciales
- **messages**: Historial de conversaciones
- **properties**: Catálogo de propiedades
- **salespeople**: Equipo de ventas
- **appointments**: Citas agendadas

## 🧪 Testing

### Test local del webhook

```bash
curl -X POST http://localhost:3000/webhook/whatsapp \
  -d "From=whatsapp:+5215610016226" \
  -d "Body=Hola SARA" \
  -d "ProfileName=Test"
```

### Test en producción

Envía un WhatsApp a `+1 415 523 8886` con el mensaje: "Hola"

## 🔐 Seguridad

- Variables de entorno para credenciales sensibles
- Validación de webhooks de Twilio
- Sanitización de inputs
- Rate limiting (próximamente)

## 📈 Monitoreo

Ver logs en Railway:
```bash
railway logs
```

## 🛠️ Tecnologías

- **Node.js 18+**
- **TypeScript 5.3**
- **Express 4.18**
- **Twilio SDK 4.20**
- **Google Gemini AI**
- **Supabase JS Client 2.39**

## 📝 Variables de Entorno

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `SUPABASE_URL` | URL de tu proyecto Supabase | `https://xxx.supabase.co` |
| `SUPABASE_KEY` | Anon public key de Supabase | `eyJhbGc...` |
| `TWILIO_ACCOUNT_SID` | Account SID de Twilio | `AC9373...` |
| `TWILIO_AUTH_TOKEN` | Auth Token de Twilio | Tu token |
| `TWILIO_WHATSAPP_NUMBER` | Número WhatsApp de Twilio | `whatsapp:+14155238886` |
| `GEMINI_API_KEY` | API Key de Google AI Studio | `AIza...` |
| `PORT` | Puerto del servidor | `3000` |
| `NODE_ENV` | Entorno | `production` |

## 🐛 Troubleshooting

Ver `DEPLOYMENT.md` para solución de problemas comunes.

## 📄 Licencia

Propiedad de Marketing TDI

## 👤 Autor

**Edson Pérez**  
CEO - Marketing TDI

---

## 🎯 Roadmap

- [ ] Function calling para acciones CRM
- [ ] Integración con calendarios
- [ ] Dashboard de analytics
- [ ] Multi-idioma
- [ ] Sistema de plantillas de respuesta
