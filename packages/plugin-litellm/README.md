# @acarmisc/backstage-plugin-litellm

Frontend for the **Backstage LiteLLM Governance Plugin** — lets developers manage
their LiteLLM virtual keys and follow their AI usage and budgets from Backstage.

Built for the [New Frontend System](https://backstage.io/docs/frontend-system/)
(`@backstage/frontend-plugin-api`). It needs the backend,
[`@acarmisc/backstage-plugin-litellm-backend`](https://www.npmjs.com/package/@acarmisc/backstage-plugin-litellm-backend),
which talks to LiteLLM and enforces every rule.

Full documentation — adoption guide, configuration, permissions, security model
and architecture — is in the
[project README](https://github.com/acarmisc/backstage-plugin-litellm-govai#readme).

## Installation

```bash
yarn --cwd packages/app add @acarmisc/backstage-plugin-litellm
```

If your app discovers features from its dependencies (`app.packages: all`),
the plugin is picked up automatically. Otherwise register it:

```tsx
// packages/app/src/App.tsx
import { createApp } from '@backstage/frontend-defaults';
import litellmPlugin from '@acarmisc/backstage-plugin-litellm';

const app = createApp({
  features: [litellmPlugin],
});
```

This adds the `/litellm` page and the `liteLlmApiRef` API used by every
component below.

## The `/litellm` page

Tabs: **Overview** (usage KPIs and charts), **Keys** (your virtual keys: edit,
block / unblock, reset spend, delete), **Teams** (team usage, and team
management for admins), **Models** (the proxy's model catalogue) and **Audit
Log** (members of `litellm.audit.group` only). `?tab=<name>` opens a tab and
`?generate=1` opens the Generate New Key dialog.

![Usage analytics](../../docs/screenshots/usage-analytics.png)

## Homepage components

| Component | What it shows |
|---|---|
| `LiteLLMHomeWidget` | Spend and tokens for `Today` / `7d` / `30d` with a daily sparkline |
| `LiteLLMBudgetWidget` | The budget hierarchy (key → personal → team → global) with a meter per limit |
| `LiteLLMBudgetGauges` | A condensed budget card: one ring per level and a month-to-date chart |
| `GenerateKeyButton` | The shared "Generate New Key" button (`onClick`, or `to="/litellm?generate=1"`) |

```tsx
import {
  LiteLLMHomeWidget,
  LiteLLMBudgetGauges,
} from '@acarmisc/backstage-plugin-litellm';

<LiteLLMHomeWidget defaultPeriod="7d" />
<LiteLLMBudgetGauges />
```

Props for each component are documented in the
[project README](https://github.com/acarmisc/backstage-plugin-litellm-govai#frontend-components).

![Home widget](../../docs/screenshots/home-widget.png)

## Other exports

- `litellmPlugin` (also the default export)
- `LiteLLMPage`, and the building blocks it uses: `DashboardHeader`,
  `KeysTable`, `UsageStats`, `TeamUsage`, `KeyFormDialog`, `ManageTeamDialog`.
  Prefer `LiteLLMPage`; composing the pieces yourself means wiring their data
  and callbacks the way the page does.
- `LiteLlmApi`, `liteLlmApiRef`, the shared API types, and the
  `litellmTeam*Permission` definitions.

## License

Apache-2.0
