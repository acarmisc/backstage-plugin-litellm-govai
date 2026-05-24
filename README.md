# Backstage LiteLLM Governance Plugin

Backstage plugin for LiteLLM governance — enables developers to manage virtual API keys and monitor AI model usage directly from Backstage.

## Overview

This is a Backstage 1.50+ plugin providing a governance interface for LiteLLM proxy. It includes:

- **Frontend**: React components built with the New Frontend System (`@backstage/frontend-plugin-api`)
- **Backend**: Express router using the New Backend System (`@backstage/backend-plugin-api`)

### Packages

- `packages/plugin-litellm` - Frontend (`@acarmisc/backstage-plugin-litellm`)
- `packages/plugin-litellm-backend` - Backend (`@acarmisc/backstage-plugin-litellm-backend`)

**Note:** Packages are published to the `@acarmisc` npm scope. The original `@govai` scope requires organizational membership.

## Installation

This plugin is designed to be used **within a Backstage monorepo**. It uses workspace dependencies and requires the Backstage CLI to build.

### Option 1: Link from File

From your Backstage monorepo root:

```bash
yarn add file:../backstage-govai/packages/plugin-litellm
yarn add file:../backstage-govai/packages/plugin-litellm-backend
```

### Option 2: Copy into Plugins Directory

Copy the packages directly into your Backstage `plugins/` directory and add them to your workspace.

## Configuration

### Environment Variables

Set these before running Backstage:

```bash
LITELLM_URL=http://litellm-proxy:4000          # LiteLLM proxy URL
LITELLM_MASTER_KEY=sk-...                      # LiteLLM admin master key
```

### App Config

Add to `app-config.yaml`:

```yaml
litellm:
  baseUrl: ${LITELLM_URL}
  masterKey: ${LITELLM_MASTER_KEY}
```

### Backend Registration

In `packages/backend/src/index.ts`:

```typescript
backend.add(import('@acarmisc/backstage-plugin-litellm-backend'));
```

### Frontend Registration

In `packages/app/src/App.tsx`:

```typescript
import { litellmPlugin, LiteLLMPage } from '@acarmisc/backstage-plugin-litellm';

// Add the route:
<Route path="/litellm" element={<LiteLLMPage />} />
```

You can also register it as a plugin extension using the New Frontend System.

## Development

### Build

Build from within your Backstage monorepo:

```bash
yarn workspace @acarmisc/backstage-plugin-litellm build
yarn workspace @acarmisc/backstage-plugin-litellm-backend build
```

### Testing

```bash
yarn workspace @acarmisc/backstage-plugin-litellm test
```

### Standalone Dev Mode

For frontend-only iteration:

```bash
cd packages/plugin-litellm
yarn start
```

## API Endpoints

The backend provides the following endpoints (all prefixed with `/api/litellm`):

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/user/info` | GET | Get current user info and quotas |
| `/keys` | GET | List user's virtual keys |
| `/keys/generate` | POST | Generate a new virtual key |
| `/keys/:keyId` | DELETE | Revoke/delete a virtual key |
| `/models` | GET | List available LLM models |
| `/usage` | GET | Get usage metrics and analytics |

## Architecture

### Frontend

- Built with React and Material-UI
- Uses Backstage API client for backend communication
- Components:
  - `LiteLLMPage` - Main plugin page
  - `DashboardHeader` - Header with user context
  - `KeysTable` - Display and manage virtual keys
  - `UsageStats` - Usage analytics with date range selector
  - `TeamUsage` - Team-specific usage breakdown

### Backend

- Express-based router
- Communicates with LiteLLM proxy API
- Handles authentication via Backstage identity system
- Provides user context resolution and API proxying

## Features

- **Key Management**: Generate, view, and revoke virtual API keys
- **Usage Analytics**: Track API usage with configurable date ranges (today, 7 days, 30 days)
- **Team Context**: Optional team-based key generation and usage tracking
- **User Info**: Display user quotas and current usage limits
- **Model Selection**: Browse available LLM models configured in LiteLLM

## Troubleshooting

- **Keys not visible**: Ensure proper Material-UI theme configuration in parent Backstage app
- **Models list empty**: Verify `LITELLM_MASTER_KEY` has permissions to list models
- **API 500 errors**: Check LiteLLM proxy connectivity and master key validity
- **Usage not updating**: Refresh your browser; analytics updates on date range change