# @acarmisc/backstage-plugin-litellm-backend

Backend for the **Backstage LiteLLM Governance Plugin** (New Backend System).
It is the only component that talks to your [LiteLLM](https://github.com/BerriAI/litellm)
proxy: it holds the master key, resolves the caller's Backstage identity, and
enforces budgets, key limits, team membership, model access and permissions
before calling LiteLLM.

Pair it with the frontend, [`@acarmisc/backstage-plugin-litellm`](https://www.npmjs.com/package/@acarmisc/backstage-plugin-litellm).
Full documentation — adoption guide, configuration reference, permissions,
security model and architecture — is in the
[project README](https://github.com/acarmisc/backstage-plugin-litellm-govai#readme).

## Installation

```bash
yarn --cwd packages/backend add @acarmisc/backstage-plugin-litellm-backend
```

In `packages/backend/src/index.ts`:

```ts
backend.add(import('@acarmisc/backstage-plugin-litellm-backend'));
```

## Minimal configuration

```yaml
litellm:
  baseUrl: http://litellm-proxy:4000        # internal URL of the LiteLLM proxy
  publicBaseUrl: https://llm.example.com    # optional: shown to users in snippets
  masterKey: ${LITELLM_MASTER_KEY}
  userIdDomain: example.com                 # optional: user:default/jane → jane@example.com
  provisioning:
    enabled: true                           # optional: create LiteLLM users on first visit
```

The configuration schema ships with the package (`config.d.ts`); see the
[configuration reference](https://github.com/acarmisc/backstage-plugin-litellm-govai#configuration)
for every key (key ceilings, team management, budget hiding, CLI bridge,
OpenCode connect).

## What it exposes

Routes are mounted under `/api/litellm`. A machine-readable OpenAPI 3.1
description is served at `/api/litellm/openapi.json`; the
[endpoint table](https://github.com/acarmisc/backstage-plugin-litellm-govai#api-endpoints)
summarises them.

The plugin registers the `litellm.*` permissions with the permission
framework (see [Permissions](https://github.com/acarmisc/backstage-plugin-litellm-govai#permissions)).

## License

Apache-2.0
