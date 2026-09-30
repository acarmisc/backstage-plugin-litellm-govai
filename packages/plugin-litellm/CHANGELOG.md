# @acarmisc/backstage-plugin-litellm

This changelog is maintained by hand — this repo is two independent npm
packages rather than a Changesets-compatible yarn workspace, so there's no
automated `yarn changeset` release flow. Add an entry here in the same
commit/PR that bumps the version in `package.json`. Format follows the
[Changesets](https://github.com/changesets/changesets) convention used by
`backstage/community-plugins`.

Earlier history: `git log -- packages/plugin-litellm` or the
 [GitHub tags](https://github.com/acarmisc/backstage-plugin-litellm-govai/tags).

## 0.30.0

Requires `@acarmisc/backstage-plugin-litellm-backend` `0.17.0`.

### Breaking Changes

- The row **Unblock** button is gated by the `litellm.key.unblock` permission
  (previously `litellm.key.manage`) and shows "No permission to unblock keys"
  when it isn't granted, matching the backend, which now requires that
  permission for every unblock.

## 0.29.0

Requires `@acarmisc/backstage-plugin-litellm-backend` `0.16.0` and
`@acarmisc/backstage-plugin-litellm-common` `0.1.0`.

### Breaking Changes

- **New Frontend System only.** There are no legacy `createPlugin` /
  `createCardExtension` exports. Homepage widgets are exported as components
  (`LiteLLMHomeWidget`, `LiteLLMBudgetGauges`, `LiteLLMBudgetWidget`, all with a
  `bare` prop); `HomePageWidgetBlueprint` registration is deferred until a
  Backstage dependency upgrade.
- **Behaviour follows the stricter backend:** the `1 Year` key duration is gone;
  Reset spend is hidden unless `litellm.keys.allowOwnerResetSpend` is on and the
  user holds `litellm.key.resetSpend`; key action buttons are gated with
  `usePermission`.
- The API base URL is resolved through `discoveryApi` (`LiteLlmApi` takes a
  `DiscoveryApi` or a fixed base string). `LiteLlmConfig.baseUrl` may be `null`
  ("Endpoint not configured").
- The Claude Code snippet's "Option 2" now reads the key from the OS keychain via
  `apiKeyHelper` instead of embedding it in a script.

### Minor Changes

- feat(keys): one-time secret protection (no Esc/backdrop dismissal, warning
  alert, confirm on closing uncopied), async copy-to-clipboard hook with
  feedback, confirmations for Block and Revoke (naming the key), in-flight
  dialogs can't be dismissed, duplicate "Generate" button removed.
- feat(form): validation on blur/submit with first-invalid focus, field order
  Team → Models → Budget → Duration → Alias → Advanced, `$` budget adornment,
  expiry preview, priciest-model token estimate, edit-mode models filtered by
  the key's team.
- feat(states): fetch failures render as errors with Retry (not as empty states),
  "–" counts when keys failed, skeleton loading and quiet "account not set up" /
  "Usage unavailable" states in the widgets, onboarding empty state,
  `?tab=keys&filter=expired|expiring` deep links, `alertApi` toasts.
- feat(budget): "Budget left" KPI from the user's own spend/cap and reset
  window; period chart relabelled "Spend in period".
- feat(widgets): responsive gauges with an MTD **spend** chart and cap line,
  `role="meter"` semantics and "Over cap" text, CTAs default to
  `['module','all-limits']` (`new-key` auto-added for users with no keys),
  redesigned home widget (summary line, themed sparkline with tooltip, route-ref
  footer link), route-ref based links, full-height cards.
- fix: editing a key sends only the fields that changed (a legacy budget above the new ceiling no longer blocks a rename); validation reasons from the server are shown; the profile cache really is cleared after writes.
- feat: shared `useLiteLLMProfile` (30 s promise cache, cleared after writes),
  catalog-backed member search, server-side prune, currency and local-date
  formatting fixes (`<$0.01`, local calendar days), usage model filter limited
  to models with usage.
- a11y: named icon buttons with tooltips, capability chips instead of emoji,
  colour-blind-safe success/failure series, decorative dots hidden from AT.
- refactor: `ui.tsx` split into `ui/*`, key snippets and form helpers extracted
  from `KeyFormDialog`; automatic JSX runtime and named React imports.
- test: jsdom component tests (KeysTable, KeyFormDialog, widgets), and a fix for
  nested test files that previously never ran.

## 0.28.0

### Minor Changes

- feat(`GenerateKeyButton`): new `fullWidth` / `disabled` props, so hosts
  with a full-width gated CTA (e.g. a homepage card that stays disabled
  until the account data loads) can use the shared button instead of their
  own inline copy. A disabled `to` renders inert rather than linking.

## 0.27.0

### Minor Changes

- feat(`LiteLLMBudgetGauges`): the card is now a fixed four-column row —
  `Key` · `User` · `Team` gauges plus a `Usage` mini-chart of daily token
  usage (stacked input/output sparkline with the month-to-date token total
  underneath). The usage period is frozen to month-to-date (1st of the
  month through today, local calendar days) — no period selector. Usage
  loads independently, so a failed usage fetch leaves the gauges untouched
  and the chart renders its empty state.
- feat(`GenerateKeyButton`): new shared "Generate New Key" CTA (contained +
  `Add` icon, `onClick` or deep-link `to` modes), used by the plugin page
  (`DashboardHeader`, `KeysTable` toolbar and empty state) and the homepage
  budget card's `new-key` CTA. Replaces the divergent `New key` /
  `Create LiteLLM key` copies — the gauges' `new-key` default label is now
  `Generate New Key`, identical to the plugin page.

### Patch Changes

- dev: the mock API's `getUsage` honours the requested window so frozen
  month-to-date periods render a realistic number of points.

## 0.26.0

### Minor Changes

- feat(`KeyFormDialog`): one shared key form for both creating and editing
  keys. Create mode keeps the previous behaviour (pre-filled alias, duration
  select, team-scoped model picker, budget estimate, post-generation screen
  with snippets). Edit mode now behaves like creation everywhere it used to
  differ: budget validation, inline error alerts (instead of console-only
  failures), duplicate-alias warning, team-scoped model filtering, and a
  gated "Unlimited budget" toggle that sends `max_budget: null` to clear the
  cap. Expiry is intentionally immutable after creation, and the team binding
  is read-only in edit mode.
- feat: `KeysTable` gains an `onEditKey(key)` callback and loses its inline
  edit dialog; editing opens the shared `KeyFormDialog` at page level.
  `onUpdateKey` / `onResetKeySpend` / `models` props are gone from
  `KeysTable` (the page wires them into the dialog instead).
- feat(`UpdateKeyRequest`): `max_budget` now accepts `null` to clear the
  budget.
- feat(`VirtualKey`): carries `team_id` from LiteLLM `/user/info`.
- deprecate(`GenerateKeyDialog`): kept as a thin wrapper around
  `KeyFormDialog mode="create"`; new hosts should import `KeyFormDialog`.

### Patch Changes

- dev: the mock API's `updateKey` now applies patches instead of returning
  the original key.

## 0.25.0

### Minor Changes

- feat(`LiteLLMBudgetGauges`): composable action bar and an in-place
  all-limits view. The bar is assembled from a `ctas` list — `new-key`
  (calls `onCreateKey`, else deep-links to `/litellm?generate=1`),
  `module` (`moduleHref`), and `all-limits` (expands a bounded, scrollable
  list of every limit; auto-hidden when none apply) — so hosts pick the
  actions and order they want. New props: `ctas`, `moduleHref`,
  `onCreateKey`, `maxExpandedKeys`, `expanded` / `defaultExpanded` /
  `onExpandedChange` (controlled or uncontrolled), alongside the existing
  `action` escape hatch. `LiteLLMPage` now honours `?generate=1`, opening
  the generate-key dialog on arrival.
- refactor: extract the shared limit card, tagged limit, and "+N more" note
  into `BudgetLimitList`, reused by both budget widgets; add
  `allBudgetLimits(summary)`.

## 0.24.0

### Minor Changes

- feat(`LiteLLMBudgetGauges`): condensed budget card for a homepage column.
  Renders one ring gauge per enforcement level — `Key` · `User` · `Team` —
  in a fixed order, each showing the limit at that level nearest its cap
  (percent in the centre, name, spend-vs-cap, and reset window below). When a
  level holds several limits the ring is the closest to its cap and a
  `+N more` link counts the rest through to the Keys tab; a level with no cap
  renders an empty ring with a short note, so the card keeps a stable
  three-ring shape. Props: `title`, `size`, `keysHref`, `action`. Backed by a
  new `buildBudgetGauges(summary)` helper and a reusable theme-aware `Gauge`
  primitive (clamps the arc at a full turn while the centre label keeps the
  real percent above 100%).

## 0.23.0

### Minor Changes

- feat: team budget hiding. When the backend redacts a team
  (`budget_hidden`, via `litellm.display.hideTeamBudgetFor*`), Teams cards
  show `Hidden` + `% used` meter + status pills instead of dollar figures,
  the team daily-spend chart is omitted, and TEAM budget meters render
  `% used` with a "Hidden by admin" note. The ManageTeamDialog budget field
  becomes write-only when `display.hideTeamBudgetForManagers` is set (blank
  keeps the current value).

## 0.22.0

### Minor Changes

- fix(`AuditLog`): stop the Audit Log tab's continuous reload / skeleton
  blink. `fetchParams` was built with an immediately-invoked `useCallback`
  (`useCallback(...)()`), producing a new object identity every render, which
  re-triggered the `useAsync` fetch on each render in an infinite loop. It is
  now memoized with `useMemo`, so the `/audit` request fires once per real
  page / page-size / filter change.

## 0.21.3

### Patch Changes

- feat(`ModelsTable`): all six columns (Model ID, Mode, Input Cost, Output
  Cost, Max Input, Max Output) are now sortable via `TableSortLabel`,
  matching the pattern used in `KeysTable`. (#84, thanks @AlexDevsTheWeb)

## 0.21.2

### Patch Changes

- feat(`LiteLLMBudgetWidget`): every view now carries a one-line cap
  hierarchy — `Order: key → personal → team → global`, first cap hit wins,
  team keys skip the personal cap — so the `compact` widget on the LiteLLM
  page isn't left unexplained.
- feat(`LiteLLMBudgetWidget`): the `+N more budgeted keys further from the
  cap` note is now a link to `/litellm?tab=keys`.
- feat(`LiteLLMPage`): the active tab is read from and written to `?tab=`
  (`overview` / `keys` / `teams` / `models` / `audit`), so tab-specific
  links work and the URL is shareable.

## 0.21.1

### Patch Changes

- feat(`LiteLLMBudgetWidget`): the collapsed summary now names the level of
  the limit closest to its cap — `4 limits · closest: team 95%` instead of
  a bare `closest 95%` — so you can tell at a glance whether the binding
  budget is a key, your personal budget, or a team's. The header also
  breaks onto two lines (title, then summary) so the longer text fits.

## 0.21.0

### Minor Changes

- feat(`LiteLLMBudgetWidget`): new `compact` prop — drops the numbered
  key → personal → team → global rail and the policy footnote, rendering
  only the limits the signed-in user actually has as a tight `KEY` /
  `USER` / `TEAM`-tagged meter list. Sized for a secondary column.
- feat(`LiteLLMBudgetWidget`): new `collapsible` / `defaultExpanded` props —
  fold the body under a one-line header showing a tone dot and a summary
  (`3 limits · closest 95%`), toggled by a chevron. Expanded by default.
- feat(`LiteLLMBudgetWidget`): new `action` slot — a host-supplied node
  (e.g. a button) pinned below a divider at the card bottom, kept visible
  when the widget is collapsed.
- feat(`LiteLLMPage`): the Overview tab is now a two-column layout at `lg`
  and up — usage charts beside a `compact` + `collapsible`
  `LiteLLMBudgetWidget`; it stacks on narrower viewports.

## 0.20.0

### Minor Changes

- feat: new `LiteLLMBudgetWidget`, a homepage-friendly card that explains
  the LiteLLM budget hierarchy (key → personal → team → global) as a
  numbered flow and, for every limit the signed-in user actually has, shows
  a live spend-vs-cap meter with the reset window. Key budgets are ranked
  by how close they are to the cap and capped at 3 (the rest collapse into
  a "+N further from the cap" note). Turquoise-blue accent, theme-aware.
- feat(api): `UserInfo` and `VirtualKey` now carry `budget_duration`, the
  spend-reset window exposed by the backend, so the widget can tell a
  "resets every 30 days" budget apart from a "never resets" one.

## 0.19.0

### Minor Changes

- feat(ModelsTable): the model-name chip in the Models tab now shows the
  full, untruncated model name in a tooltip on hover and copies the model
  ID to the clipboard on click (with a pointer cursor and keyboard
  support), matching the adjacent copy-icon behaviour.
- feat(ModelsTable): the "Filter Models" input is now disabled until a team
  is selected, and a dedicated "No models match your search" empty state is
  shown when the filter hides every model of an otherwise non-empty team.
  The results subtitle switches to an `X of Y models` form while a filter
  is active.
- fix(dev): give the two mock API extensions in `dev/index.tsx` explicit
  names, resolving a `Plugin 'litellm' provided duplicate extensions:
  api:litellm` crash that blocked `backstage-cli package start` locally.

## 0.18.1

### Patch Changes

- feat(ModelsTable): add text filter input to the Models tab, positioned next to the Team dropdown. Filter matches model names and access groups (case-insensitive). Follows the existing `KeysTable` filter pattern.

## 0.18.0

### Minor Changes

- feat(TeamUsage): the **Create Team** action moved from a standalone button
  above the Teams tab into the "Teams" section card's own header, alongside
  the team count — matching the placement of "Generate New Key" on the Keys
  tab. It now also renders in the empty state, not just once teams exist.
- feat(ManageTeamDialog): the **Members** section got a UX pass:
  - Adding a member is now a catalog-backed `Autocomplete` (search by name
    or email) instead of a free-text entity-ref field, using `catalogApiRef`
    to look up `User` entities — the same check the backend already runs on
    add. Typing a raw `user:namespace/name` ref still works as a fallback.
    Users already on the team are filtered out of the suggestions.
  - The member list itself is now a table (User / Role / Remove) styled like
    the read-only team card elsewhere in the app, replacing the plain
    bulleted list.
  - The **Models** field now explains, via helper text, why at least one
    model is required in this delegated-admin flow (it can only grant
    access to the configured `teamAdmin.allowedModels` allowlist, never to
    every proxy model) — clarifying it against teams shown elsewhere with no
    model restriction, which were configured directly in LiteLLM.
- New dependencies: `@backstage/plugin-catalog-react`, `@backstage/catalog-model`.

## 0.17.0

### Minor Changes

- feat(ManageTeamDialog): the **Max Budget** field is now bounded by the
  server ceiling (`teamManagement.maxBudgetCeiling`, default 1000) via a
  native `max` and a new team's budget pre-fills to that ceiling.
- feat(ManageTeamDialog): **Budget Duration** is now a dropdown
  (Daily / Weekly / Monthly / Quarterly / Yearly) instead of free text; an
  unusual existing value stays selectable. `TeamInfo` gains `budget_duration`
  so edit mode pre-selects the team's current period.

## 0.16.0

### Minor Changes

- feat: **delegated team management** UI for a `litellm-team-admins` group.
  - The **Teams** tab gains a "Create Team" button and per-team "Edit", each
    gated by `config.teamManagement.enabled` **and** the corresponding
    `usePermission` decision (`litellm.team.create` / `.manage`).
  - New `ManageTeamDialog` — alias, model multi-select, budget (with the
    server ceiling shown), plus edit-mode sections for **Members**
    (`litellm.team.members.manage`), **Knowledge Bases**
    (`litellm.team.knowledgebase.manage`), and **MCP Servers**
    (`litellm.team.mcp.manage`), the latter two shown only when
    `objectPermissionsEnabled`.
  - `LiteLlmApi` gains `createTeam`, `updateTeam`, `getManagedTeams`,
    `addTeamMember`, `removeTeamMember`, `getVectorStores`,
    `setTeamKnowledgeBases`, `getMcpServers`, `setTeamMcpServers`.
  - New exported permission refs (`litellmTeam*Permission`) mirroring the
    backend by name; `ManageTeamDialog` is exported.
  - Audit Log tab: added `Team member` and `Team access (KB / MCP)` table
    filters.
  - New peer/dep on `@backstage/plugin-permission-react` +
    `@backstage/plugin-permission-common`.

## 0.15.5

### Patch Changes

- release: litellm v0.15.5

## 0.15.4

### Patch Changes

- release: litellm v0.15.4

## 0.15.3

### Patch Changes

- fix: chart period filter — store preset explicitly instead of heuristic date detection
- docs: expand README gallery with all plugin surfaces

## 0.15.2

### Patch Changes

- fix: improve model and key controls
- feat: export GenerateKeyDialog from public entrypoint

## 0.15.0

### Minor Changes

- feat: add Models tab and Claude Code snippet

## 0.14.0

### Minor Changes

- feat: opencode/pi config snippets and public endpoint in key modal
- feat: comprehensive UI redesign for professional appearance
