# @acarmisc/backstage-plugin-litellm

Frontend for the **Backstage LiteLLM Governance Plugin** — lets developers manage LiteLLM virtual API keys and monitor AI model usage directly from Backstage.

Built with the [New Frontend System](https://backstage.io/docs/frontend-system/) (`@backstage/frontend-plugin-api`) and Material-UI.

Pair this package with the backend, [`@acarmisc/backstage-plugin-litellm-backend`](https://www.npmjs.com/package/@acarmisc/backstage-plugin-litellm-backend), which proxies requests to your LiteLLM instance and resolves Backstage identity.

Full setup docs, configuration reference, and architecture notes live in the [project README](https://github.com/acarmisc/backstage-plugin-litellm-govai#readme).

## Screenshots

| View | Preview |
|------|---------|
| Home widget — `LiteLLMHomeWidget` | ![Home widget](../../docs/screenshots/home-widget.png) |
| Overview / Usage Analytics | ![Usage analytics](../../docs/screenshots/usage-analytics.png) |
| Keys tab — virtual key inventory | ![Keys tab](../../docs/screenshots/keys-tab.png) |
| Generate New Key dialog | ![Generate New Key dialog](../../docs/screenshots/generate-key-dialog.png) |
| Models tab | ![Models tab](../../docs/screenshots/models-tab.png) |
| Compact "Create Key" card | ![Create Key card](../../docs/screenshots/key-card.png) |

## Installation

This plugin is designed to be used **within a Backstage monorepo**.

```bash
yarn add --cwd packages/app @acarmisc/backstage-plugin-litellm
```

You'll also need the backend package installed and configured — see its [README](https://www.npmjs.com/package/@acarmisc/backstage-plugin-litellm-backend) for `app-config.yaml` setup.

## Usage

### Full page

The `LiteLLMPage` component renders the four-tab governance view: **Overview** (usage KPIs + charts), **Keys** (virtual key inventory), **Teams** (team-scoped usage), and **Models** (proxy model catalog).

```tsx
import { litellmPlugin, LiteLLMPage } from '@acarmisc/backstage-plugin-litellm';

// packages/app/src/App.tsx
<Route path="/litellm" element={<LiteLLMPage />} />
```

![Usage Analytics full page](../../docs/screenshots/usage-analytics-overview.png)

### Home page widget

`LiteLLMHomeWidget` is a compact card for the Backstage homepage. It shows the signed-in user's own usage — identity is resolved server-side from the Backstage token, so no `userId` prop is required. The header includes a `Today` / `7d` / `30d` period selector and a daily-spend sparkline.

```tsx
import { LiteLLMHomeWidget } from '@acarmisc/backstage-plugin-litellm';

<LiteLLMHomeWidget defaultPeriod="7d" />
```

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `defaultPeriod` | `'today' \| '7d' \| '30d'` | `'7d'` | Period shown on first render |
| `title` | `string` | `'LiteLLM Usage'` | Card title override |

A slimmer **Create Key** card variant is available for surfaces that only need a one-click shortcut into the key-mint flow:

![Create Key card](../../docs/screenshots/key-card.png)

### Keys tab

The **Keys** tab lists every virtual key you own with its alias, key ID, creation and expiry dates, budget bar (`$spent / $limit`), TPM/RPM, and model scope. Each row exposes inline actions: edit, block/unblock, reset spend, and delete.

![Keys tab](../../docs/screenshots/keys-tab.png)

### Generate New Key dialog

The dialog walks the user through aliasing the key, picking a duration, binding a team, restricting model access, setting a max budget, and configuring per-key TPM/RPM caps. Failures (e.g. duplicate alias) surface inline with the upstream error code preserved.

![Generate New Key dialog](../../docs/screenshots/generate-key-dialog.png)

### Models tab

The **Models** tab lists every model the LiteLLM proxy exposes, with per-model input/output cost, max input/output token limits, and capabilities. The team selector scopes the list to the models the bound team is allowed to call.

![Models tab](../../docs/screenshots/models-tab.png)

## Exports

- `litellmPlugin` — the frontend plugin instance
- `LiteLLMPage` — main plugin page (keys, usage, team context)
- `LiteLLMHomeWidget` — homepage usage summary card
- `GenerateKeyDialog` — shared "Generate New Key" dialog (surfaces failures inline, warns on duplicate aliases)
- `DashboardHeader`, `KeysTable`, `UsageStats`, `TeamUsage` — individual page sections, exported for composition
- `LiteLlmApi`, `liteLlmApiRef` — API client and its Backstage API ref

Note: `DashboardHeader` and `KeysTable` are composition pieces driven by `LiteLLMPage` and their props differ from older versions. `LiteLLMPage` is the supported entry point; composing the sections directly means keeping them in sync with the page's data wiring (keys, models, teams, and the `onGenerateKeyClick` callback).

## License

Apache-2.0
