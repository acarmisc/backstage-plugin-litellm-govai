# LiteLLM Plugin Migration - Hand Off

## Context
Migrating `@govai/backstage-plugin-litellm` and `@govai/backstage-plugin-litellm-backend` to Backstage 1.50+

## Status
✅ **All TypeScript errors resolved** (was 21)

## Files Fixed
- `plugins/plugin-litellm/src/index.ts` - Fixed default export (imports plugin first, then re-exports)
- `plugins/plugin-litellm-backend/src/index.ts` - Fixed default export (imports default from plugin.ts)
- `plugins/plugin-litellm-backend/src/client.ts` - Fixed Config type (uses config.getOptional)
- `plugins/plugin-litellm-backend/src/plugin.ts` - Updated deps, removed identity
- `plugins/plugin-litellm-backend/src/router.ts` - Removed `auth` destructuring, fixed `resolveUserContext` to use `credentials.principal` (with type assertion for `userEntityRef`/`subject`)
- `plugins/plugin-litellm/dev/index.tsx` - Removed unused `React` import
- `plugins/plugin-litellm/src/components/KeysTable.tsx` - Removed unused `React` import, changed `Typography color` prop to `style.color` (MUI v4 compat)
- `plugins/plugin-litellm/src/components/LiteLLMPage.tsx` - Removed unused `React` import, added `themeId="tool"` to all `<Page>` components
- `plugins/plugin-litellm/src/components/UsageStats.tsx` - Already clean (no unused imports)
- `plugins/plugin-litellm/src/components/UserContextCard.tsx` - Removed unsupported `variant="elevated"` prop from `InfoCard`

## Key Changes Applied
1. **BackendFeature export** - Backend `index.ts` now does `import plugin from './plugin'; export default plugin;` so `backend.add()` receives the actual plugin object with `$$type`
2. **Frontend default export** - Frontend `index.ts` now imports `litellmPlugin` before re-exporting it as default, fixing the TS2304 error
3. **Removed React imports** - Backstage 18+ doesn't need explicit React imports
4. **Page themeId** - Added `themeId="tool"` to all `<Page>` components
5. **Router fixes** - Removed stale `auth` destructuring, fixed credentials access pattern
6. **MUI v4 compat** - Used `style` prop instead of `color` for Typography, removed `variant="elevated"` from InfoCard