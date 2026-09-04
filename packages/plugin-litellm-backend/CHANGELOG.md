# @acarmisc/backstage-plugin-litellm-backend

This changelog is maintained by hand — this repo is two independent npm
packages rather than a Changesets-compatible yarn workspace, so there's no
automated `yarn changeset` release flow. Add an entry here in the same
commit/PR that bumps the version in `package.json`. Format follows the
[Changesets](https://github.com/changesets/changesets) convention used by
`backstage/community-plugins`.

Earlier history: `git log -- packages/plugin-litellm-backend` or the
[GitHub tags](https://github.com/acarmisc/backstage-plugin-litellm-govai/tags).

## 0.11.1

### Patch Changes

- fix: retry `client.getTeamInfo()` (100ms / 300ms / 900ms backoff, ~1.3s
  total) on every route that fetches team info — `GET /teams`, the
  team-subresource authorization check, and the read-after-write fetch on
  member add/remove. Only 5xx and network/timeout failures are retried; a
  deterministic 4xx (e.g. team not found) fails immediately as before. This
  smooths over a proxy running multiple replicas where a request can land
  on one that hasn't caught up with a very recent write, which previously
  surfaced as a team silently missing from `GET /teams` or a spurious
  404/500 right after a membership change.

## 0.11.0

### Minor Changes

- feat: `litellm.teamAdmin.maxBudgetCeiling` now defaults to **1000** (USD) when
  unset, instead of leaving the ceiling unconfigured. `TeamAdminConfig.maxBudgetCeiling`
  is consequently always a number; the "ceiling is not configured" validation
  branch is removed. `GET /config` returns the numeric ceiling (never null),
  and `DEFAULT_TEAM_BUDGET_CEILING` is exported.
- feat: `TeamInfo` / `LiteLLMClient` now surface `budget_duration`.

## 0.10.0

### Minor Changes

- feat: **delegated team management** for a `litellm-team-admins` group.
  - New permissions: `litellm.team.create`, `litellm.team.manage`,
    `litellm.team.members.manage`, `litellm.team.knowledgebase.manage`,
    `litellm.team.mcp.manage`, `litellm.team.delete`.
  - New config block `litellm.teamAdmin.*` (group, model/budget/vector-store/
    MCP allowlists, `objectPermissions.enabled`, `allowTeamDelete`) — all
    fail-closed; the feature stays disabled unless `permission.enabled` and
    `litellm.teamAdmin.group` are both set.
  - New routes: `POST /teams`, `PATCH /teams/:id`, `DELETE /teams/:id`,
    `GET /teams/managed`, `POST` / `DELETE /teams/:id/members`,
    `GET /vector-stores`, `PUT /teams/:id/knowledge-bases`,
    `GET /mcp-servers`, `PUT /teams/:id/mcp-servers`. Each enforces group
    membership + the permission decision + an owning-group object guard, and
    validates models / budgets / stores / servers against the allowlists.
  - `GET /config` now returns a `teamManagement` block.
  - `LiteLLMClient` gains `createTeam` / `updateTeam` / `deleteTeam` /
    `blockTeam` / `unblockTeam` / `listTeams` / `teamMemberAdd` /
    `teamMemberDelete` / `listVectorStores` / `listMcpServers`.
  - Structured audit events: `team.create`, `team.update`, `team.delete`,
    `team.member.add/remove`, `team.knowledgebase.set`, `team.mcp.set`.
  - `RouterOptions` gains a `catalogClient` test override.

## 0.9.0

### Minor Changes

- feat: wire up the Backstage permission framework (`litellm.key.create`, `litellm.key.revoke`, `litellm.key.manage`, `litellm.audit.read`) — additive on top of the existing ownership guard and audit-group check; no-op until an operator installs a permission policy

## 0.8.2

### Patch Changes

- feat: opencode/pi config snippets and public endpoint in key modal
- docs: replace real internal domain examples with generic placeholders

## 0.8.1

### Patch Changes

- release: litellm v0.12.4, litellm-backend v0.8.1
- ci: commit package-lock.json for both packages
- fix: resolve all ESLint errors across both packages, add lint/test scripts

## 0.8.0

### Minor Changes

- feat: header Generate CTA + key/expiry counters, inline generate errors, upstream status passthrough

## 0.7.0

### Minor Changes

- feat: gated unlimited-budget/team-required toggles, team-scoped models, default alias

## 0.6.2

### Patch Changes

- fix: actionable error on team key-duration override, show member emails

## 0.6.1

### Patch Changes

- fix: remove Enterprise-only key rotation, fix duplicate Done CTA
