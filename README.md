# Backstage LiteLLM Governance Plugin

Backstage plugin for LiteLLM governance - allows developers to manage their virtual keys and monitor AI usage.

## Installation

```bash
# From your Backstage repo
yarn add @govai/backstage-plugin-litellm @govai/backstage-plugin-litellm-backend
```

## Configuration

Add to `app-config.yaml`:

```yaml
litellm:
  baseUrl: ${LITELLM_URL}
  masterKey: ${LITELLM_MASTER_KEY}
```

## Backend Setup

In `packages/backend/src/plugins/litellm.ts`:

```typescript
import { litellmPlugin } from '@govai/backstage-plugin-litellm-backend';

export default async function createPlugin(ctx: CreateRouterContext) {
  return await litellmPlugin.create(context);
}
```

Then add to `packages/backend/src/index.ts`:

```typescript
backend.add(import('@govai/backstage-plugin-litellm-backend'));
```

## Frontend Setup

In `packages/app/src/App.tsx`:

```typescript
import { litellmPlugin, LiteLLMPage } from '@govai/backstage-plugin-litellm';

const routes = (
  <FlatRoutes>
    {/* ... */}
    <Route path="/litellm" element={<LiteLLMPage />} />
  </FlatRoutes>
);
```

## Development

```bash
# Install dependencies
yarn install

# Build packages
yarn build

# Run tests
yarn test
```

## Environment Variables

- `LITELLM_URL` - LiteLLM proxy URL (e.g., `http://litellm-proxy:4000`)
- `LITELLM_MASTER_KEY` - LiteLLM admin master key (`sk-...`)

## API Endpoints

- `GET /api/litellm/info` - User info and keys
- `GET /api/litellm/teams` - List teams
- `GET /api/litellm/usage` - Usage stats (last 7 days)
- `GET /api/litellm/health` - Health check