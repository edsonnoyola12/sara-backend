#!/bin/bash
set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# Load API key from .dev.vars
API_KEY=$(grep API_SECRET .dev.vars | cut -d= -f2 | tr -d '"' | tr -d ' ')
if [ -z "$API_KEY" ]; then
  echo -e "${RED}Error: API_SECRET not found in .dev.vars${NC}"
  exit 1
fi

STAGING_URL="https://sara-backend-staging.edson-633.workers.dev"
PROD_URL="https://sara-backend.edson-633.workers.dev"

echo "=== SARA Deploy Validation ==="
echo ""

# Step 1: Unit tests
echo "1/4 Running unit tests..."
npm test
echo -e "${GREEN}Unit tests passed${NC}"
echo ""

# Step 2: Deploy to staging
echo "2/4 Deploying to staging..."
npx wrangler deploy --env staging
echo -e "${GREEN}Staging deployed${NC}"
echo ""

# Step 3: E2E validation on staging
echo "3/4 Running E2E validation on staging..."
RESULT=$(curl -s "${STAGING_URL}/api/validate?api_key=${API_KEY}")
FAILED=$(echo "$RESULT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('failed', 99))")
SUMMARY=$(echo "$RESULT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('summary', 'ERROR'))")

echo "   Result: $SUMMARY"

if [ "$FAILED" -gt 0 ]; then
  echo -e "${RED}E2E validation FAILED on staging ($FAILED tests failed)${NC}"
  echo "$RESULT" | python3 -c "
import json,sys
d = json.load(sys.stdin)
for r in d.get('results', []):
    if not r['passed']:
        print(f\"   FAIL: {r['name']}: {r['details']}\")
"
  echo ""
  echo "Aborting deploy to production."
  exit 1
fi
echo -e "${GREEN}E2E validation passed on staging${NC}"
echo ""

# Step 4: Deploy to production
echo "4/4 Deploying to production..."
npx wrangler deploy
echo -e "${GREEN}Production deployed${NC}"
echo ""

# Step 5: Quick health check on production
echo "Verifying production health..."
HEALTH=$(curl -s "${PROD_URL}/health")
ALL_PASSED=$(echo "$HEALTH" | python3 -c "import json,sys; print(json.load(sys.stdin).get('allPassed', False))")

if [ "$ALL_PASSED" = "True" ]; then
  echo -e "${GREEN}Production health: ALL CHECKS PASSED${NC}"
else
  echo -e "${RED}Production health: SOME CHECKS FAILED${NC}"
  echo "$HEALTH" | python3 -m json.tool
fi

echo ""
echo "=== Deploy Complete ==="
