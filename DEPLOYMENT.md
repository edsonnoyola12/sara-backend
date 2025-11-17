# 🚀 SARA Backend - Deployment Guide

## ⚡ DEPLOYMENT EN 10 MINUTOS

### Paso 1: Configurar Supabase (3 minutos)

1. Ve a https://supabase.com y crea cuenta (gratis)
2. Crea nuevo proyecto
3. Ve a "SQL Editor"
4. Copia y pega el contenido de `schema.sql`
5. Click "Run"
6. Guarda:
   - **Project URL**: Settings > API > Project URL
   - **Anon Key**: Settings > API > anon public key

### Paso 2: Configurar Gemini API (1 minuto)

1. Ve a https://aistudio.google.com/app/apikey
2. Crea API key
3. Guarda la key (empieza con `AIza...`)

### Paso 3: Configurar Twilio WhatsApp (2 minutos)

Ya tienes las credenciales:
- **Account SID**: `TU_TWILIO_ACCOUNT_SID`
- **Auth Token**: (búscalo en tu dashboard de Twilio)
- **WhatsApp Number**: `whatsapp:+14155238886`

### Paso 4: Deploy a Railway (3 minutos)

#### Opción A: Via CLI (recomendado)

```bash
# Instalar Railway CLI
npm install -g @railway/cli

# Login
railway login

# Inicializar proyecto
railway init

# Agregar variables de entorno
railway variables set SUPABASE_URL="https://tu-proyecto.supabase.co"
railway variables set SUPABASE_KEY="tu-anon-key"
railway variables set TWILIO_ACCOUNT_SID="TU_TWILIO_ACCOUNT_SID"
railway variables set TWILIO_AUTH_TOKEN="tu-auth-token"
railway variables set TWILIO_WHATSAPP_NUMBER="whatsapp:+14155238886"
railway variables set GEMINI_API_KEY="tu-gemini-key"
railway variables set PORT="3000"
railway variables set NODE_ENV="production"

# Deploy
railway up
```

#### Opción B: Via Web (más visual)

1. Ve a https://railway.app
2. Login con GitHub
3. New Project > Deploy from GitHub repo
4. Selecciona tu repo
5. En "Variables", agrega TODAS las credenciales de arriba
6. Railway detectará Node.js automáticamente
7. Espera 2-3 minutos y ¡LISTO!

### Paso 5: Configurar Twilio Webhook (1 minuto)

1. Ve a https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn
2. En "Webhook URL for incoming messages" pega:
   ```
   https://tu-proyecto.railway.app/webhook/whatsapp
   ```
3. Method: `HTTP POST`
4. Save

### ✅ VERIFICACIÓN

1. **Test health check**:
   ```bash
   curl https://tu-proyecto.railway.app/health
   ```
   Debe responder: `{"status":"ok",...}`

2. **Test WhatsApp**:
   - Envía mensaje a `+1 415 523 8886`
   - Mensaje: "Hola SARA"
   - SARA debe responder automáticamente

### 🐛 TROUBLESHOOTING

**Error: "API keys are not supported"**
- Verifica que `GEMINI_API_KEY` esté correcta y empiece con `AIza`

**Error: "Twilio authentication failed"**
- Verifica `TWILIO_ACCOUNT_SID` y `TWILIO_AUTH_TOKEN`
- No deben tener espacios ni comillas

**Error: "Supabase connection failed"**
- Verifica `SUPABASE_URL` (debe ser https://...)
- Verifica `SUPABASE_KEY` (la anon public key)

**SARA no responde en WhatsApp**
1. Verifica logs en Railway
2. Confirma que el webhook esté configurado en Twilio
3. Asegúrate que activaste el sandbox de Twilio WhatsApp

### 📊 MONITOREO

**Ver logs en Railway:**
1. Dashboard > Tu proyecto
2. Click en "Deployments"
3. Click en el deployment activo
4. Verás logs en tiempo real

### 🔄 ACTUALIZAR CÓDIGO

```bash
# Hacer cambios en tu código
git add .
git commit -m "Update SARA"
git push

# Railway redeploya automáticamente
```

### 📱 TESTING LOCAL

```bash
# Instalar dependencias
npm install

# Crear archivo .env con tus credenciales
cp .env.example .env
# Edita .env con tus valores reales

# Correr en desarrollo
npm run dev

# Test local del webhook
curl -X POST http://localhost:3000/webhook/whatsapp \
  -d "From=whatsapp:+5215610016226" \
  -d "Body=Hola SARA" \
  -d "ProfileName=Edson"
```

---

## 🎉 ¡LISTO!

SARA ahora está en vivo 24/7 respondiendo WhatsApp automáticamente.

**Siguiente paso:** Conecta tu React frontend al backend para tener un CRM completo.
