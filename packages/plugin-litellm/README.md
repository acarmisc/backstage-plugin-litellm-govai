# @acarmisc/backstage-plugin-litellm

Frontend for the **Backstage LiteLLM Governance Plugin** — lets developers manage LiteLLM virtual API keys and monitor AI model usage directly from Backstage.

Built with the [New Frontend System](https://backstage.io/docs/frontend-system/) (`@backstage/frontend-plugin-api`) and Material-UI.

Pair this package with the backend, [`@acarmisc/backstage-plugin-litellm-backend`](https://www.npmjs.com/package/@acarmisc/backstage-plugin-litellm-backend), which proxies requests to your LiteLLM instance and resolves Backstage identity.

Full setup docs, configuration reference, and architecture notes live in the [project README](https://github.com/acarmisc/backstage-plugin-litellm-govai#readme).

## Installation

This plugin is designed to be used **within a Backstage monorepo**.

```bash
yarn add --cwd packages/app @acarmisc/backstage-plugin-litellm
```

You'll also need the backend package installed and configured — see its [README](https://www.npmjs.com/package/@acarmisc/backstage-plugin-litellm-backend) for `app-config.yaml` setup.

## Usage

### Full page

```tsx
import { litellmPlugin, LiteLLMPage } from '@acarmisc/backstage-plugin-litellm';

// packages/app/src/App.tsx
<Route path="/litellm" element={<LiteLLMPage />} />
```

### Home page widget

`LiteLLMHomeWidget` is a compact card for the Backstage homepage. It shows the signed-in user's own usage — identity is resolved server-side from the Backstage token, so no `userId` prop is required.

```tsx
import { LiteLLMHomeWidget } from '@acarmisc/backstage-plugin-litellm';

<LiteLLMHomeWidget defaultPeriod="7d" />
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `defaultPeriod` | `'today' \| '7d' \| '30d'` | `'7d'` | Period shown on first render |
| `title` | `string` | `'LiteLLM Usage'` | Card title override |

## Exports

- `litellmPlugin` — the frontend plugin instance
- `LiteLLMPage` — main plugin page (keys, usage, team context)
- `LiteLLMHomeWidget` — homepage usage summary card
- `DashboardHeader`, `KeysTable`, `UsageStats`, `TeamUsage` — individual page sections, exported for composition
- `LiteLlmApi`, `liteLlmApiRef` — API client and its Backstage API ref

## License

Apache-2.0
