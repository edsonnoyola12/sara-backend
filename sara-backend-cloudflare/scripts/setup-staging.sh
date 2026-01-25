#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# Setup Staging Environment
# ═══════════════════════════════════════════════════════════════════════════
# Este script copia los secrets de .dev.vars al environment de staging
# Ejecutar una sola vez después de crear el environment
# ═══════════════════════════════════════════════════════════════════════════

set -e

echo "═══════════════════════════════════════════════════════════════"
echo "  SARA Backend - Setup Staging Secrets"
echo "═══════════════════════════════════════════════════════════════"

# Verificar que existe .dev.vars
if [ ! -f .dev.vars ]; then
    echo "❌ Error: .dev.vars no encontrado"
    echo "   Crea el archivo con los secrets necesarios"
    exit 1
fi

echo ""
echo "📋 Leyendo secrets de .dev.vars..."
echo ""

# Lista de secrets a copiar
SECRETS=(
    "ANTHROPIC_API_KEY"
    "API_SECRET"
    "GEMINI_API_KEY"
    "GOOGLE_API_KEY"
    "GOOGLE_CALENDAR_ID"
    "GOOGLE_PRIVATE_KEY"
    "GOOGLE_SERVICE_ACCOUNT_EMAIL"
    "META_ACCESS_TOKEN"
    "META_PHONE_NUMBER_ID"
    "META_VERIFY_TOKEN"
    "SUPABASE_ANON_KEY"
    "SUPABASE_SERVICE_ROLE_KEY"
    "SUPABASE_URL"
    "VEO_API_KEY"
)

# Contador
COPIED=0
SKIPPED=0

for SECRET in "${SECRETS[@]}"; do
    # Extraer valor del .dev.vars
    VALUE=$(grep "^${SECRET}=" .dev.vars 2>/dev/null | cut -d'=' -f2-)
    
    if [ -z "$VALUE" ]; then
        echo "⚠️  $SECRET - No encontrado en .dev.vars (skipped)"
        SKIPPED=$((SKIPPED + 1))
        continue
    fi
    
    echo "🔐 $SECRET - Configurando en staging..."
    echo "$VALUE" | npx wrangler secret put "$SECRET" --env staging 2>/dev/null
    COPIED=$((COPIED + 1))
done

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✅ Setup completo!"
echo "  📊 Secrets copiados: $COPIED"
echo "  ⚠️  Secrets skipped: $SKIPPED"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "🚀 Para hacer deploy a staging:"
echo "   npx wrangler deploy --env staging"
echo ""
echo "🔍 Para ver logs de staging:"
echo "   npx wrangler tail --env staging"
echo ""
