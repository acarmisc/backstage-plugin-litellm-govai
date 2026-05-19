# Fix for Issue #3: Period selector always displays 'Last 7 days'
# File: packages/plugin-litellm/src/components/UsageStats.tsx

## Problem
The selectedPreset logic checks range in wrong order:
- First checks if <= 7 days (returns '7d')
- Then returns '30d' for everything else
- Never returns 'today' even for same-day ranges

## Solution
Reorder the checks so 'today' (<= 1 day) is checked FIRST

## Code Fix
```typescript
// BEFORE (incorrect):
const selectedPreset = useMemo(() => {
  const diffMs = dateRange.end.getTime() - dateRange.start.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 1) return 'today';
  if (diffDays <= 7) return '7d';
  return '30d';
}, [dateRange]);

// AFTER (correct):
const selectedPreset = useMemo(() => {
  const diffMs = dateRange.end.getTime() - dateRange.start.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  // Check 'today' first (0-1 days), then '7d' (1-7 days), then '30d'
  if (diffDays <= 0) return 'today';  // Exact same day
  if (diffDays <= 1) return 'today';  // Yesterday to today
  if (diffDays <= 7) return '7d';
  return '30d';
}, [dateRange]);
```

## Alternative: More Precise Fix
```typescript
const selectedPreset = useMemo(() => {
  const start = dateRange.start;
  const end = dateRange.end;
  
  // Same day = today
  const isSameDay = start.toDateString() === end.toDateString();
  if (isSameDay) return 'today';
  
  const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 7) return '7d';
  return '30d';
}, [dateRange]);
```

## Implementation
Find the `selectedPreset` useMemo in UsageStats.tsx (around line 77) and 
replace the logic with the corrected version above.