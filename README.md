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

Set these in your shell or deployment environment before starting Backstage. Backstage's config system supports `${ENV_VAR}` substitution in `app-config.yaml`:

```bash
LITELLM_BASE_URL=http://litellm-proxy:4000     # LiteLLM proxy URL
LITELLM_MASTER_KEY=sk-...                      # LiteLLM admin master key
```

### App Config Schema

Add to `app-config.yaml`. All keys live under the `litellm` top-level namespace:

```yaml
litellm:
  # Required — base URL of your LiteLLM proxy instance.
  # @visibility backend
  baseUrl: ${LITELLM_BASE_URL}

  # Required — LiteLLM master key for admin operations.
  # Never exposed to the frontend (marked @visibility secret).
  masterKey: ${LITELLM_MASTER_KEY}

  # Optional — email domain appended to the Backstage user entity name to form
  # the LiteLLM user_id. When set, a user entity "user:default/john.doe" maps
  # to "john.doe@example.com" in LiteLLM. Omit to use the bare entity name.
  # @visibility backend
  userIdDomain: example.com   # optional

  # Optional — autoprovisioning of LiteLLM users on first access.
  provisioning:
    # Whether to automatically create a LiteLLM user when the Backstage user
    # is not yet known to LiteLLM. Disabled by default.
    enabled: false   # default

    defaults:
      # Max lifetime spend (USD) before the account is blocked.
      maxBudget: 10          # default: 10

      # Spend-reset period after which the spend counter resets.
      # Accepts LiteLLM duration strings: "30d", "7d", "1h", etc.
      budgetDuration: 30d    # default: "30d"

      # LiteLLM model IDs the new user is allowed to call.
      # An empty list means all models configured in the proxy are allowed.
      models: []             # default: [] (all models)

      # LiteLLM team IDs to enrol the new user in automatically.
      teams: []              # default: [] (no teams)

      # LiteLLM role assigned to every provisioned user.
      # Valid values: proxy_admin, proxy_admin_viewer, internal_user,
      #               internal_user_viewer, team.
      userRole: internal_user   # default: "internal_user"

      # Tokens per minute hard cap (omit for no per-user limit).
      # tpmLimit: 100000

      # Requests per minute hard cap (omit for no per-user limit).
      # rpmLimit: 1000

      # Arbitrary key-value metadata stored on the LiteLLM user record.
      # metadata:
      #   cost_centre: engineering

    # Optional — role-based provisioning overrides.
    # Evaluated in order; first matching group wins.
    # Fields omitted here fall back to defaults above.
    roles:
      - group: group:default/ai-power-users   # Backstage group entity ref
        maxBudget: 100
        budgetDuration: 30d
        models:
          - gpt-4o
          - claude-3-5-sonnet
        userRole: internal_user
```

**Config key reference:**

| Key | Type | Required | Default | Description |
|-----|------|----------|---------|-------------|
| `litellm.baseUrl` | string | yes | — | LiteLLM proxy base URL |
| `litellm.masterKey` | string | yes | — | Admin master key (`@visibility secret`) |
| `litellm.userIdDomain` | string | no | — | Email domain for LiteLLM user IDs |
| `litellm.provisioning.enabled` | boolean | no | `false` | Enable autoprovisioning |
| `litellm.provisioning.defaults.maxBudget` | number | no | `10` | Max spend (USD) per reset period |
| `litellm.provisioning.defaults.budgetDuration` | string | no | `"30d"` | Spend-reset period |
| `litellm.provisioning.defaults.models` | string[] | no | `[]` | Allowed model IDs (empty = all) |
| `litellm.provisioning.defaults.teams` | string[] | no | `[]` | Team IDs to join on creation |
| `litellm.provisioning.defaults.userRole` | string | no | `"internal_user"` | LiteLLM role |
| `litellm.provisioning.defaults.tpmLimit` | number | no | — | Tokens-per-minute cap |
| `litellm.provisioning.defaults.rpmLimit` | number | no | — | Requests-per-minute cap |
| `litellm.provisioning.defaults.metadata` | object | no | `{}` | Extra metadata on user record |
| `litellm.provisioning.roles[].group` | string | yes* | — | Backstage group entity ref |
| `litellm.provisioning.roles[].maxBudget` | number | no | — | Overrides default for group |
| `litellm.provisioning.roles[].budgetDuration` | string | no | — | Overrides default for group |
| `litellm.provisioning.roles[].models` | string[] | no | — | Overrides default for group |
| `litellm.provisioning.roles[].teams` | string[] | no | — | Overrides default for group |
| `litellm.provisioning.roles[].userRole` | string | no | — | Overrides default for group |
| `litellm.provisioning.roles[].tpmLimit` | number | no | — | Overrides default for group |
| `litellm.provisioning.roles[].rpmLimit` | number | no | — | Overrides default for group |
| `litellm.provisioning.roles[].metadata` | object | no | — | Merged over default metadata |

*required when the `roles` array is present

### Backend Registration

In `packages/backend/src/index.ts`:

```typescript
backend.add(import('@acarmisc/backstage-plugin-litellm-backend'));
```

### Frontend Registration

The plugin uses the Backstage New Frontend System. Add the plugin package as an extension in `packages/app/src/App.tsx` or equivalent:

```typescript
import { litellmPlugin, LiteLLMPage } from '@acarmisc/backstage-plugin-litellm';

// Add the route:
<Route path="/litellm" element={<LiteLLMPage />} />
```

You can also register it as a plugin extension using the New Frontend System.

### Autoprovisioning

When `litellm.provisioning.enabled` is `true`, the backend automatically creates a LiteLLM user the first time a Backstage user hits any plugin endpoint (user info, keys, teams, or usage). The flow is:

1. The backend resolves the caller's Backstage identity from the request token (`user:default/<name>`).
2. It checks whether that identity already exists in LiteLLM via `/user/info`.
3. If not found, it looks up the user's Backstage catalog entity to fetch their profile (email, display name) and group memberships.
4. It applies any matching `provisioning.roles` override (first match wins), then calls `/user/new` on LiteLLM with the effective defaults.
5. A concurrent single-flight lock prevents duplicate `/user/new` calls when several endpoints fire in parallel on the same page load.

**Backstage catalog prerequisites:**

- The user **must exist as a `User` entity in the Backstage catalog**. The catalog is the source of truth for email, display name, and group memberships.
- Group memberships (used for role matching) are resolved from the `memberOf` relations on the user entity. These are typically populated by a catalog provider such as the LDAP, GitHub, or Microsoft Graph org provider.
- If `userIdDomain` is set, the entity name (e.g. `john.doe` from `user:default/john.doe`) is combined with the domain to produce the LiteLLM `user_id` (e.g. `john.doe@example.com`). Make sure LiteLLM users were created with matching IDs if you are migrating an existing deployment.
- If a user signs in without a catalog entity (e.g. `dangerouslyAllowSignInWithoutUserInCatalog` is set), provisioning still proceeds but the LiteLLM user record will lack email, display name, and team-role resolution — they will receive the default settings.

**Minimum working example with autoprovisioning enabled:**

```yaml
litellm:
  baseUrl: ${LITELLM_BASE_URL}
  masterKey: ${LITELLM_MASTER_KEY}
  provisioning:
    enabled: true
    defaults:
      maxBudget: 5
      budgetDuration: 30d
```

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

### "No team membership found in LiteLLM for this account."

This message is displayed in the Teams panel when the authenticated user exists in LiteLLM but belongs to no LiteLLM teams. It is an informational UI state, not an error — the user is provisioned and can still generate keys and view usage.

**Why it happens:**

- The user was provisioned with `provisioning.defaults.teams: []` (the default), so no teams were assigned at creation time.
- Alternatively the user was created manually in LiteLLM without team membership.

**How to fix:**

1. Add the user to a LiteLLM team via the LiteLLM admin UI or API.
2. Or set `litellm.provisioning.defaults.teams` (or a matching role override) to include the relevant LiteLLM team IDs before the user's first sign-in. Users already provisioned will not be retroactively re-assigned — update them via LiteLLM directly.

### "User not found in LiteLLM" (404 from the backend)

The backend returns a 404 with `{ "error": "User not found in LiteLLM", "hint": "...", "provisioning": false }` when:

- The user does not exist in LiteLLM, **and**
- `litellm.provisioning.enabled` is `false` (the default).

**Fix:** Either enable autoprovisioning (`litellm.provisioning.enabled: true`) or create the user manually in LiteLLM using an ID that matches the Backstage entity name (plus `userIdDomain` if configured).

### User identity is not resolving / user_id mismatch

The backend derives the LiteLLM `user_id` from the Backstage token using the formula:

```
user_id = <entity-name> [ + "@" + userIdDomain ]
```

For example, `user:default/john.doe` with `userIdDomain: example.com` produces `john.doe@example.com`. If LiteLLM has the user stored under a different ID (e.g. the full email was used as the entity name), the lookup will fail.

**Fix:** Align the LiteLLM user IDs with what the plugin derives, or adjust `userIdDomain`. If the Backstage entity name is already in email form (e.g. `user:default/john.doe@example.com`), do **not** set `userIdDomain` — the plugin detects the `@` and skips the domain suffix to avoid double-appending.

### Keys not visible

Ensure proper Material-UI theme configuration in your parent Backstage app.

### Models list empty

Verify that `LITELLM_MASTER_KEY` has permissions to list models on the LiteLLM proxy.

### API 500 errors

Check LiteLLM proxy connectivity and master key validity. The backend health endpoint (`GET /api/litellm/health`) returns the provisioning status and can confirm the plugin is reachable.

### Usage not updating

Usage analytics refresh when the date range selector is changed. If data appears stale, change the range and change it back to trigger a reload.