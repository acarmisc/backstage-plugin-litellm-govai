# LiteLLM Governance Plugin

## Overview

Backstage plugin for LiteLLM governance - allows developers to manage their virtual keys and monitor AI usage.

## Packages

- `packages/plugin-litellm` - Frontend React components
- `packages/plugin-litellm-backend` - Backend Express router

## Integration with Backstage

To test in the parent Backstage (`../backstage`):

1. **Link packages** - Add to Backstage's workspace or use `yarn workspace`:
   ```
   cd ../backstage
   yarn add @govai/backstage-plugin-litellm
   yarn add @govai/backstage-plugin-litellm-backend
   ```

2. **Add to app-config.yaml**:
   ```yaml
   litellm:
     baseUrl: ${LITELLM_URL}
     masterKey: ${LITELLM_MASTER_KEY}
   ```

3. **Register backend** - In `packages/backend/src/plugins/litellm.ts`:
   ```typescript
   import { litellmPlugin } from '@govai/backstage-plugin-litellm-backend';
   // Add to createBackend() in index.ts
   ```

4. **Register frontend** - In `packages/app/src/App.tsx`:
   ```typescript
   import { litellmPlugin, LiteLLMPage } from '@govai/backstage-plugin-litellm';
   // Add route and nav item
   ```

## Env Variables

- `LITELLM_URL` - LiteLLM proxy URL (e.g., `http://litellm-proxy:4000`)
- `LITELLM_MASTER_KEY` - LiteLLM admin master key (`sk-...`)

## Development

Run standalone dev mode:
```bash
cd packages/plugin-litellm
yarn start
```

## Reference

For core Backstage commands: `../backstage/AGENTS.md`