# LiteLLM Governance Plugin

## Overview

Backstage plugin for LiteLLM governance - allows developers to manage their virtual keys and monitor AI usage.

## Packages

- `@acarmisc/backstage-plugin-litellm` - Frontend React components
- `@acarmisc/backstage-plugin-litellm-backend` - Backend Express router

**Note:** These packages were published to the `@acarmisc` npm scope. The original `@govai` scope requires organizational membership.

## Architecture

- **Frontend:** Uses the New Frontend System (`@backstage/frontend-plugin-api`) with `PageExtension`
- **Backend:** Uses the New Backend System (`@backstage/backend-plugin-api`) with `createBackendPlugin`

## Integration with Backstage

To test in the parent Backstage (`../backstage`):

1. **Link packages** - Add to Backstage's workspace or use `yarn workspace`:
   ```
   cd ../backstage
   yarn add @acarmisc/backstage-plugin-litellm
   yarn add @acarmisc/backstage-plugin-litellm-backend
   ```

2. **Add to app-config.yaml**:
   ```yaml
   litellm:
     baseUrl: ${LITELLM_URL}
     masterKey: ${LITELLM_MASTER_KEY}
   ```

3. **Register backend** - In `packages/backend/src/plugins/litellm.ts`:
   ```typescript
   import { litellmPlugin } from '@acarmisc/backstage-plugin-litellm-backend';
   // Add to createBackend() in index.ts
   ```

4. **Register frontend** - In `packages/app/src/App.tsx`:
   ```typescript
   import { litellmPlugin } from '@acarmisc/backstage-plugin-litellm';
   // Add route and nav item using the new Frontend System
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

## Backend API Endpoints

- `GET /api/litellm/health` - Health check
- `GET /api/litellm/user/info` - Get user info and quotas
- `GET /api/litellm/keys` - List virtual keys
- `POST /api/litellm/keys/generate` - Generate new key
- `DELETE /api/litellm/keys/:keyId` - Revoke key
- `GET /api/litellm/models` - List available models
- `GET /api/litellm/usage` - Get usage metrics

## Reference

For core Backstage commands: `../backstage/AGENTS.md`