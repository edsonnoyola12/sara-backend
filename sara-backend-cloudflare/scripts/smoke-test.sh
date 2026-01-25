#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# SARA Backend - Smoke Tests
# Ejecutar después de cada deploy para verificar que el sistema funciona
# USO: ./scripts/smoke-test.sh [URL] [API_SECRET]
# ═══════════════════════════════════════════════════════════════════════════

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

API_URL=${1:-"https://sara-backend.edsonnoyola12.workers.dev"}
API_SECRET=${2:-""}

echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  SARA Backend - Smoke Tests${NC}"
echo -e "${YELLOW}  URL: $API_URL${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo ""

PASSED=0
FAILED=0

# Helper function
test_endpoint() {
  local name=$1
  local method=$2
  local endpoint=$3
  local expected_status=$4
  local extra_args=$5

  echo -n "  Testing: $name... "

  response=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$API_URL$endpoint" $extra_args 2>/dev/null || echo "000")

  if [ "$response" == "$expected_status" ]; then
    echo -e "${GREEN}PASS${NC} (HTTP $response)"
    PASSED=$((PASSED + 1))
  else
    echo -e "${RED}FAIL${NC} (Expected $expected_status, got $response)"
    FAILED=$((FAILED + 1))
  fi
}

# ═══════════════════════════════════════════════════════════════════════════
# 1. Health Checks (públicos)
# ═══════════════════════════════════════════════════════════════════════════
echo -e "\n${YELLOW}[1/4] Health Checks${NC}"
test_endpoint "Root endpoint" "GET" "/" "200"
test_endpoint "Health endpoint" "GET" "/health" "200"

# ═══════════════════════════════════════════════════════════════════════════
# 2. Auth Tests (debe rechazar sin API key)
# ═══════════════════════════════════════════════════════════════════════════
echo -e "\n${YELLOW}[2/4] Auth Tests${NC}"
test_endpoint "API sin auth (debe rechazar)" "GET" "/api/team-members" "401"
test_endpoint "Debug sin auth (debe rechazar)" "GET" "/debug-cache" "401"

# ═══════════════════════════════════════════════════════════════════════════
# 3. Webhook Tests
# ═══════════════════════════════════════════════════════════════════════════
echo -e "\n${YELLOW}[3/4] Webhook Tests${NC}"
# Webhook con token incorrecto debe rechazar (403) - esto verifica que el endpoint existe y valida tokens
test_endpoint "Webhook rechaza token inválido" "GET" "/webhook/meta?hub.mode=subscribe&hub.verify_token=invalid&hub.challenge=test123" "403"

# ═══════════════════════════════════════════════════════════════════════════
# 4. Protected Endpoints (con API key si se proporciona)
# ═══════════════════════════════════════════════════════════════════════════
if [ -n "$API_SECRET" ]; then
  echo -e "\n${YELLOW}[4/4] Protected Endpoints (con auth)${NC}"
  test_endpoint "Debug cache con auth" "GET" "/debug-cache?api_key=$API_SECRET" "200"
  test_endpoint "API team-members con auth" "GET" "/api/team-members?api_key=$API_SECRET" "200"
else
  echo -e "\n${YELLOW}[4/4] Protected Endpoints${NC}"
  echo -e "  ${YELLOW}SKIP${NC} - No API_SECRET proporcionado"
  echo "  Uso: $0 URL API_SECRET"
fi

# ═══════════════════════════════════════════════════════════════════════════
# Resumen
# ═══════════════════════════════════════════════════════════════════════════
echo -e "\n${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
TOTAL=$((PASSED + FAILED))
if [ $FAILED -eq 0 ]; then
  echo -e "  ${GREEN}RESULTADO: $PASSED/$TOTAL tests pasaron${NC}"
  echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
  exit 0
else
  echo -e "  ${RED}RESULTADO: $PASSED/$TOTAL tests pasaron, $FAILED fallaron${NC}"
  echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
  exit 1
fi
