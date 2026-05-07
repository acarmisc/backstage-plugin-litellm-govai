# Backstage LiteLLM Governance Plugin

Backstage plugin for LiteLLM governance - allows developers to manage their virtual keys and monitor AI usage.

## Usage

This plugin is designed to be used **within a Backstage monorepo** (like the main Backstage repo). It uses workspace dependencies and requires the Backstage CLI to build.

### Installation

From your Backstage monorepo root:

```bash
# Link the packages (from this plugin's directory)
yarn add file:../backstage-govai/packages/plugin-litellm
yarn add file:../backstage-govai/packages/plugin-litellm-backend
```

Or copy these packages directly into your Backstage `plugins/` directory.

### Configuration

Add to `app-config.yaml`:

```yaml
litellm:
  baseUrl: ${LITELLM_URL}
  masterKey: ${LITELLM_MASTER_KEY}
```

### Backend Setup

In `packages/backend/src/plugins/litellm.ts`:

```typescript
import { litellmPlugin } from '@govai/backstage-plugin-litellm-backend';

export default async function createPlugin(context: CreateRouterContext) {
  return await litellmPlugin.create(context);
}
```

Add to `packages/backend/src/index.ts`:

```typescript
backend.add(import('@govai/backstage-plugin-litellm-backend'));
```

### Frontend Setup

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

Build and test from within Backstage monorepo:

```bash
# In your Backstage monorepo root
yarn workspace @govai/backstage-plugin-litellm build
yarn workspace @govai/backstage-plugin-litellm-backend build

# Run tests
yarn workspace @govai/backstage-plugin-litellm test
```

## API Endpoints

- `GET /api/litellm/info` - User info and keys
- `GET /api/litellm/teams` - List teams  
- `GET /api/litellm/usage` - Usage stats (last 7 days)
- `GET /api/litellm/health` - Health check

## Environment Variables

- `LITELLM_URL` - LiteLLM proxy URL (e.g., `http://litellm-proxy:4000`)
- `LITELLM_MASTER_KEY` - LiteLLM admin master key (`sk-...`)