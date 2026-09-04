# @acarmisc/backstage-plugin-litellm

This changelog is maintained by hand — this repo is two independent npm
packages rather than a Changesets-compatible yarn workspace, so there's no
automated `yarn changeset` release flow. Add an entry here in the same
commit/PR that bumps the version in `package.json`. Format follows the
[Changesets](https://github.com/changesets/changesets) convention used by
`backstage/community-plugins`.

Earlier history: `git log -- packages/plugin-litellm` or the
[GitHub tags](https://github.com/acarmisc/backstage-plugin-litellm-govai/tags).

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
