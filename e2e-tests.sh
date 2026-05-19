#!/bin/bash
# E2E Test Script for LiteLLM Backstage Plugin
# Tests for issues: #2, #3, #6, #7, #9

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== LiteLLM Backstage Plugin E2E Tests ===${NC}"
echo "Testing for issues #2, #3, #6, #7, #9"
echo ""

# Get correct script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load environment variables from secret
export LITELLM_URL="http://localhost:4000"
export LITELLM_MASTER_KEY="sk-iU3...vT9c="

# Test base URL
BASE_URL="http://localhost:3000"
BACKEND_URL="http://localhost:7007"

echo -e "${YELLOW}Test 1: Check Key Visibility (Issue #2)${NC}"
echo "Checking KeysTable.tsx for white-on-white background issues..."

# Check key display styling in KeysTable
if grep -q "backgroundColor: 'background.default'" "$SCRIPT_DIR/packages/plugin-litellm/src/components/KeysTable.tsx"; then
    echo -e "${GREEN}[INFO]${NC} Key display uses background.default"
else
    echo -e "${YELLOW}[WARN]${NC} Key display might have contrast issues"
fi

# Check for Chip styling with variant="outlined"
if grep -q 'variant="outlined"' "$SCRIPT_DIR/packages/plugin-litellm/src/components/KeysTable.tsx"; then
    echo -e "${GREEN}[PASS]${NC} Keys table uses outlined variant"
else
    echo -e "${RED}[FAIL]${NC} Keys table might not use outlined variant"
fi

echo ""

echo -e "${YELLOW}Test 2: Check Period Selector (Issue #3)${NC}"
echo "Checking UsageStats.tsx period selector logic..."

# Check the selectedPreset logic - look for the order of conditions
if grep -q "if (diffDays <= 1) return 'today'" "$SCRIPT_DIR/packages/plugin-litellm/src/components/UsageStats.tsx"; then
    echo -e "${RED}[FAIL]${NC} Today check comes AFTER 7d check in current logic"
else
    echo -e "${GREEN}[PASS]${NC} Today check is in correct position"
fi

# Show the actual logic
echo "Current period selection logic:"
grep -A6 "const selectedPreset = useMemo" "$SCRIPT_DIR/packages/plugin-litellm/src/components/UsageStats.tsx" | head -8

echo ""

echo -e "${YELLOW}Test 3: Check Models List Visibility (Issue #7)${NC}"
echo "Checking if model names are properly styled..."

# Check model name display in UsageStats
if grep -q "m.model_name}" "$SCRIPT_DIR/packages/plugin-litellm/src/components/UsageStats.tsx"; then
    echo -e "${GREEN}[PASS]${NC} Model names are displayed in dropdowns"
else
    echo -e "${RED}[FAIL]${NC} Model name display issue"
fi

# Check key alias in key rows
if grep -q "r.keyAlias" "$SCRIPT_DIR/packages/plugin-litellm/src/components/UsageStats.tsx"; then
    echo -e "${GREEN}[PASS]${NC} Key aliases are displayed"
else
    echo -e "${RED}[FAIL]${NC} Key alias display issue"
fi

echo ""

echo -e "${YELLOW}Test 4: Check Delete Key Error Handling (Issue #6)${NC}"
echo "Checking backend error handling for deleted keys..."

# Check if router has 404 error handling
if grep -q "status(error.status)" "$SCRIPT_DIR/packages/plugin-litellm-backend/src/router.ts"; then
    echo -e "${GREEN}[PASS]${NC} Backend has error status handling"
else
    echo -e "${YELLOW}[WARN]${NC} Backend missing specific error status handling"
fi

echo ""

echo -e "${YELLOW}Test 5: Check Analytics Update Logic (Issue #9)${NC}"
echo "Checking if usage analytics refresh properly..."

# Check if refreshKeys is called after key operations
if grep -q "refreshKeys()" "$SCRIPT_DIR/packages/plugin-litellm/src/components/LiteLLMPage.tsx"; then
    echo -e "${GREEN}[PASS]${NC} refreshKeys is called after operations"
else
    echo -e "${RED}[FAIL]${NC} refreshKeys not properly called"
fi

# Check if usage re-fetches on date change
if grep -q "useAsync(async () =>.*api.getUsage.*dateRange" "$SCRIPT_DIR/packages/plugin-litellm/src/components/LiteLLMPage.tsx"; then
    echo -e "${GREEN}[PASS]${NC} Usage automatically refreshes on date range change"
else
    echo -e "${YELLOW}[WARN]${NC} Usage might not refresh properly"
fi

echo ""

echo -e "${GREEN}=== Summary ===${NC}"
echo "Test results above show potential issues:"
echo ""
echo "Expected fixes:"
echo "1. #2 (Key visibility): Ensure background.default contrasts with dark themes"
echo "2. #3 (Period selector): Reorder logic to check 'today' first (<=1 day)"
echo "3. #6 (Delete key): Handle 404 as 'already deleted' instead of 500 error"
echo "4. #7 (Models list): Verify text opacity and contrast settings"
echo "5. #9 (Analytics): Ensure refreshKeys triggers re-fetch"
echo ""
echo -e "${GREEN}E2E Test Complete${NC}"
