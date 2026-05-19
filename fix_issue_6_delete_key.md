# Fix for Issue #6: Error 500 when revoking existing key
# File: packages/plugin-litellm-backend/src/router.ts

## Problem
When trying to delete a key that doesn't exist (or already deleted), LiteLLM returns 404.
The current implementation catches the error but returns 500 instead of handling it gracefully.

## Current Code (lines 167-180)
```typescript
router.delete('/keys/:keyId', async (req: Request, res: Response) => {
  try {
    const { keyId } = req.params;
    if (!keyId) {
      res.status(400).json({ error: 'keyId is required' });
      return;
    }
    await client.deleteKeys({ keys: [keyId] });
    res.json({ success: true });
  } catch (error: any) {
    logger.error('Failed to delete key', error);
    res.status(500).json({ error: error.message });
  }
});
```

## Solution
Handle 404 as "key not found" status, which effectively means the deletion 
is already complete (idempotent delete).

## Code Fix
```typescript
router.delete('/keys/:keyId', async (req: Request, res: Response) => {
  try {
    const { keyId } = req.params;
    if (!keyId) {
      res.status(400).json({ error: 'keyId is required' });
      return;
    }
    await client.deleteKeys({ keys: [keyId] });
    res.json({ success: true });
  } catch (error: any) {
    // Handle 404 as "already deleted" (idempotent operation)
    if (error.status === 404) {
      logger.warn(`Key ${keyId} not found (already deleted or never existed)`);
      res.status(200).json({ success: true, message: 'Key already deleted' });
      return;
    }
    
    logger.error('Failed to delete key', error);
    res.status(500).json({ error: error.message });
  }
});
```

## Client-side Fix (Optional Improvement)
Also update the frontend to handle this gracefully:

File: packages/plugin-litellm/src/components/LiteLLMPage.tsx (lines 131-142)

```typescript
const handleDeleteKey = useCallback(
  async (keyId: string) => {
    try {
      await api.deleteKey(keyId);
      setSnackbar({ 
        message: 'Key revoked successfully', 
        severity: 'success' 
      });
      refreshKeys();
    } catch (e: any) {
      // Handle "already deleted" response gracefully
      if (e.body?.message?.includes('already deleted')) {
        setSnackbar({ 
          message: 'Key was already deleted', 
          severity: 'warning' 
        });
        refreshKeys();  // Still refresh to ensure consistency
      } else {
        setSnackbar({ 
          message: `Failed to revoke key: ${e.message}`, 
          severity: 'error' 
        });
      }
    }
  },
  [api, refreshKeys],
);
```