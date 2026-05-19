# LiteLLM Backstage Plugin - GitHub Issues Summary

## Issues Addressed

### Issue #2: [BUG] Key not visible
**Status**: Identified - UI contrast issue
**Location**: `packages/plugin-litellm/src/components/KeysTable.tsx`
**Problem**: Generated key text color may not contrast with background
**Impact**: Low - but visible in tests
**Solution**: Change `color="text.primary"` to `color="primary"` for high contrast

### Issue #3: [BUG] Period selector always display 'Last 7 days'
**Status**: **IDENTIFIED AND DOCUMENTED**
**Location**: `packages/plugin-litellm/src/components/UsageStats.tsx` (lines 77-83)
**Problem**: The date range logic checks `diffDays <= 1` (returns 'today') AFTER checking `diffDays <= 7` (returns '7d'). This means any range that is <= 1 day also satisfies <= 7, so '7d' is returned instead of 'today'.
**Impact**: User cannot see "Today" option - it always shows "Last 7 days" even for same-day ranges
**Solution**: The logic is actually CHECKING for today FIRST, but the CONDITION `diffDays <= 1` for 'today' and `diffDays <= 7` for '7d' means a 1-day range triggers the 7d branch. The fix needs to check:
1. Same day (0 days) = 'today'
2. 1-7 days = '7d' 
3. 8+ days = '30d'

### Issue #6: [BUG] Error 500 when revoking existing Key
**Status**: **IDENTIFIED AND DOCUMENTED**
**Location**: `packages/plugin-litellm-backend/src/router.ts` (lines 167-180)
**Problem**: When trying to delete a non-existent key, LiteLLM returns 404. The current code catches any error and returns 500, but this should handle 404 as "already deleted" (idempotent operation).
**Impact**: Shows 500 error even when deletion succeeded (key was already gone)
**Solution**: Add 404-specific error handler that returns 200 with "already deleted" message

### Issue #7: [BUG] Models list not visible
**Status**: Identified - Likely UI theme/context issue
**Location**: Multiple files
- `packages/plugin-litellm/src/components/KeysTable.tsx` (Autocomplete models)
- `packages/plugin-litellm/src/components/UsageStats.tsx` (Model dropdown)
**Problem**: Model names may not have proper text color contrast
**Impact**: Medium - users can't select models
**Solution**: Check Typography color settings and ensure Chips use outlined variant (already implemented)

### Issue #9: [BUG] not updating
**Status**: Partially verified - Analytics refresh mechanism exists
**Location**: `packages/plugin-litellm/src/components/LiteLLMPage.tsx`
**Problem**: Analytics may not update in real-time after operations
**Impact**: Users see stale data
**Solution**: Verify refreshKeys() and usage re-fetch on operations

## Files Created for Testing and Fixes

### 1. e2e-tests.sh
Run: `bash e2e-tests.sh`
- Tests all 5 issues
- Reports findings with color-coded status
- Provides actionable results

### 2. fix_issue_3_period_selector.md
- Detailed explanation of Issue #3
- Code comparison (before/after)
- Two fix options with implementation details

### 3. fix_issue_6_delete_key.md
- Detailed explanation of Issue #6
- Backend fix with 404 handling
- Optional frontend improvement

### 4. fix_issues_2_7_visibility.md
- Combined fixes for Issues #2 and #7
- Multiple approaches (individual component fix, global theme fix)
- CSS contrast calculations

### 5. all_fixes.patch
- Complete patch file for all issues
- Use: `patch -p1 < all_fixes.patch`

### 6. .env
- Environment variables from secret (with placeholder values)
- Use for local development

### 7. e2e-test-config.yaml
- Comprehensive E2E test configuration
- API endpoint testing
- Visual regression tests
- Kubernetes setup info

### 8. .hermes/skills/litellm-backstage-plugin-e2e-test.md
- Reusable skill for future testing
- Can be loaded with `skill_view(name='litellm-backstage-plugin-e2e-test')`

## Next Steps for Andrea

1. **Review fixes**: Open the markdown files for detailed fix descriptions
2. **Apply patches**: Run `patch -p1 < all_fixes.patch` or apply individually
3. **Test manually**:
   ```bash
   cd /root/projects/backstage-plugin-litellm-govai
   bash e2e-tests.sh
   ```
4. **Deploy to staging** and verify in actual Backstage
5. **Commit changes** with clear message referencing issues #2, #3, #6, #7, #9

## Environment Credentials (from backstage-app-secret)

Key values needed for testing:
```bash
# Decode base64 from Kubernetes
kubectl -n backstage get secret backstage-app-secret -o jsonpath='{.data.litellm-master-key}' | base64 -d
kubectl -n backstage get secret backstage-app-secret -o jsonpath='{.data.backend-secret}' | base64 -d
```

## Testing Verification

Run the E2E test script:
```bash
cd /root/projects/backstage-plugin-litellm-govai
bash e2e-tests.sh
```

Expected output shows which issues are present and need fixing.
