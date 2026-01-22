#!/bin/bash
# Smoke Test para SARA - Verifica que endpoints críticos respondan
# Uso: ./scripts/smoke-test.sh

BASE_URL="https://sara-backend.edson-633.workers.dev"
PASSED=0
FAILED=0

echo "🧪 SARA Smoke Test"
echo "=================="
echo ""

test_endpoint() {
  local name="$1"
  local url="$2"
  local expected="$3"

  response=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)

  if [ "$response" == "$expected" ]; then
    echo "✅ $name - OK ($response)"
    ((PASSED++))
  else
    echo "❌ $name - FALLÓ (esperado: $expected, recibido: $response)"
    ((FAILED++))
  fi
}

test_json_endpoint() {
  local name="$1"
  local url="$2"

  response=$(curl -s "$url" 2>/dev/null)

  if echo "$response" | grep -q "{"; then
    echo "✅ $name - OK (JSON válido)"
    ((PASSED++))
  else
    echo "❌ $name - FALLÓ (no es JSON)"
    ((FAILED++))
  fi
}

echo "📡 Probando endpoints..."
echo ""

# Health check
test_endpoint "Health Check" "$BASE_URL/health" "200"

# Debug endpoints
test_json_endpoint "Debug GPS" "$BASE_URL/debug-gps"

# Webhook (debe retornar 200 o 400, no 500)
response=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/webhook" 2>/dev/null)
if [ "$response" != "500" ] && [ "$response" != "502" ] && [ "$response" != "503" ]; then
  echo "✅ Webhook endpoint - OK ($response)"
  ((PASSED++))
else
  echo "❌ Webhook endpoint - FALLÓ ($response)"
  ((FAILED++))
fi

echo ""
echo "=================="
echo "Resultados: $PASSED pasaron, $FAILED fallaron"

if [ $FAILED -gt 0 ]; then
  echo "⚠️  Hay endpoints fallando!"
  exit 1
else
  echo "🎉 Todos los endpoints responden correctamente"
  exit 0
fi
