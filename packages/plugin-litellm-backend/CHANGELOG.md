# @acarmisc/backstage-plugin-litellm-backend

This changelog is maintained by hand — this repo is an npm workspace, but it has
no automated Changesets release flow. Add an entry here in the same
commit/PR that bumps the version in `package.json`. Format follows the
[Changesets](https://github.com/changesets/changesets) convention used by
`backstage/community-plugins`.

Earlier history: `git log -- packages/plugin-litellm-backend` or the
[GitHub tags](https://github.com/acarmisc/backstage-plugin-litellm-govai/tags).

## 0.17.2

### Patch Changes

- **fix(bridge): default `max_budget` for CLI mints.** `POST /bridge/keys` now
  falls back to `litellm.provisioning.defaults.maxBudget` when the caller sends
  no `max_budget` and `allowUnlimitedBudget` is false, instead of answering 400
  `max_budget is required`. CLI clients such as Abby don't know the budget
  policy. An explicit `max_budget` (including `null`) is unchanged.

## 0.17.1

### Patch Changes

- **fix(bridge): resolve LiteLLM user from email-shaped preferred_username and
  reuse existing user by email.** When the CLI's `preferred_username` claim is
  an email address (e.g. `andrea.carmisciano@abstract.it`) and its domain is in
  the trusted list, the bridge now extracts the local part before resolving the
  user ID, so it maps to the same LiteLLM user the UI addresses. Additionally,
  if the computed user ID is not found, the bridge searches for an existing user
  by email (via `GET /user/list?user_email=...`) before provisioning, reusing a
  user created by the UI under a different ID (e.g. a bare entity name) but the
  same email. This avoids duplicate user creation and 409 conflicts when the
  bridge client's identity differs from the UI's identity computation.

## 0.17.0

### Breaking Changes

- **Unblocking always needs `litellm.key.unblock`.** 0.16.x let an owner unblock
  a key whose `metadata.blocked_by` was themselves, without the permission. That
  record is writable by the owner (keys created before 0.16, or a stale value
  left when an admin unblocks in the LiteLLM UI), so it could not tell "I blocked
  it" from "an admin blocked it". It is no longer consulted: `POST
  /keys/:id/unblock` requires the permission for every caller (ownership is still
  checked), and `blocked_by` / `blocked_at` are kept for audit only. Grant
  `litellm.key.unblock` to the roles that may lift blocks; without a grant, users
  can still block their own keys but an administrator must unblock them. This
  also makes the 0.16.0 "audit keys for a forged `blocked_by`" upgrade note moot.

## 0.16.1

### Patch Changes

- **fix(bridge): map the CLI identity to the same LiteLLM user the UI uses.**
  0.16.0 derived the bridge user from the *email local part* and required
  `litellm.userIdDomain`. That addressed (and auto-provisioned) a different
  LiteLLM user whenever a Keycloak username differs from the email, and made the
  bridge unusable for deployments whose LiteLLM ids are bare entity names.
  The bridge now separates the two questions: a *verified* email in a trusted
  domain gets you in (`litellm.bridge.allowedEmailDomains`, defaulting to
  `litellm.userIdDomain`; neither set → `403`), and the LiteLLM id is the Keycloak
  `preferred_username` run through the same `litellm.userIdDomain` rule the UI
  applies (email local part only when the token has no username).
  **If you run the bridge without `litellm.userIdDomain`, set
  `litellm.bridge.allowedEmailDomains` when upgrading to 0.16.x**; do not set
  `userIdDomain` just to satisfy the bridge — that changes every UI user id.
  If you already ran 0.16.0 with the bridge, look for duplicate LiteLLM users
  named after the email local part and clean them up.

## 0.16.0

**Security release — contains breaking behaviour changes. Upgrade
`@acarmisc/backstage-plugin-litellm-common` (new, `0.1.0`) together with this
package.**

### Breaking Changes

- **User routes only accept Backstage user principals.** `/user/info`, `/keys*`,
  `/teams` (GET), `/teams/:teamId/usage` and `/usage` return `401` for service /
  external principals and anonymous callers. The `user_id` query/body fallback
  is gone; the LiteLLM identity comes only from the verified credential.
  `client.getUsage` throws on an empty user instead of querying org-wide.
- **Strict request schemas.** `POST /keys/generate` and `POST /keys/:id/update`
  reject unknown fields with `400`, and the upstream request is built from the
  parsed fields. `allowUnlimitedBudget`, `teamRequired`, team membership and the
  allowed-model check are now enforced server-side. New ceilings:
  `litellm.keys.maxBudget` (100), `maxTpm` (100000), `maxRpm` (1000),
  `allowedDurations` (`1d/7d/30d/90d`; a `1y` duration is no longer accepted).
- **Reset spend and unblock are gated.** Reset needs
  `litellm.keys.allowOwnerResetSpend: true` (default `false`) plus the new
  `litellm.key.resetSpend` permission; unblocking a key someone else blocked
  needs the new `litellm.key.unblock` permission. `unblock` no longer requires
  `litellm.key.manage` for keys the caller blocked themselves.
- **`GET /teams/:teamId/usage`** requires membership of the team, or (with team
  management enabled) membership of the team's `metadata.owning_group`; `404`
  otherwise. Membership of the global team-admin group alone no longer grants
  access to every team's usage.
- **`GET /config`** returns the configured `publicBaseUrl` only (`null` when
  unset) — it no longer falls back to the internal `baseUrl`.
- **CLI bridge** needs a trusted email domain (see 0.16.1: `litellm.bridge.allowedEmailDomains`,
  defaulting to `litellm.userIdDomain`) and verified emails in it; ID tokens (`typ: ID`) and unverified or foreign
  emails are rejected, and verifier error details are no longer returned. Key
  minting uses the same validation and enforcement as the UI (strict schema,
  ceilings, flags, team and model checks). First-time provisioning from a bridge
  token applies the base defaults only (no group role overrides), and the
  bridge does not evaluate Backstage permissions.
- **OpenCode connect** no longer mints or returns anything on `GET`: `GET` shows
  a confirmation page and `POST` creates or **rotates** the key (via LiteLLM key
  regeneration) — it used to redirect with a key *hash* when a key existed.
  Clients that drive the flow with a bare browser `GET` redirect must be updated
  to follow the confirmation.
- **Server-owned metadata is reserved.** `POST /keys/generate` rejects client
  `metadata` containing `blocked_by`, `blocked_at`, `created_*` or `updated_*`;
  re-blocking an already-blocked key is a `409` and never rewrites `blocked_by`.
- **Keys always expire.** A generate request without `duration` now gets `30d`
  (or the first allowed duration) instead of a non-expiring key.
- **Model allow-lists** follow LiteLLM's rules on the server too: the
  `all-proxy-models` sentinel means unrestricted, and team lists may name model
  access groups.
- **Error responses are sanitised.** Upstream `401`/`403` → `502`, upstream
  `5xx` and network failures (refused/reset/timeout) → generic `502`, upstream `4xx` messages are stripped of HTML
  and capped at 500 characters; unexpected errors return `Internal error`.

### Minor Changes

- feat: `POST /keys/prune-expired` (server-side prune returning
  `{ pruned, failed, failures? }`).
- feat: per-user `getUserInfo` cache (`litellm.cache.userInfoTtlSeconds`,
  default 10 s, single-flight, cleared on any mutation).
- feat: `litellm.supportContact` (served via `GET /config`); `PATCH /teams/:id`
  honours the client's `expectedUpdatedAtIso` (unchanged) and the UI now sends it.
- feat: `budget_reset_at` is passed through on the user profile.
- refactor: `router.ts` split into `routes/*`, `http/*` and
  `services/keyService.ts`; permissions, key schemas and shared types moved to
  `@acarmisc/backstage-plugin-litellm-common` (still re-exported from here).
- refactor: `LoggerService` / `RootConfigService` typing, `@backstage/errors`,
  `any` usage cut from 95 to 39 sites; declared `litellm.opencode.*`,
  `userRole` and the new keys in `config.d.ts`.
- fix: OpenCode rotation falls back to replacing the key (delete + generate)
  on LiteLLM editions without key regeneration (including the open-source
  "Enterprise feature" error); the confirmation page's CSP
  allows the localhost callback redirect; the user-info cache is also cleared on
  team membership changes.
- chore: the provisioning log line no longer logs the user id at `info`.

## 0.15.0

### Minor Changes

- feat(`VirtualKey`): carries `team_id` from LiteLLM `/user/info` so the
  frontend can scope the key-form model picker to the key's team in edit
  mode.

## 0.13.0

### Minor Changes

- feat: independent `litellm.display.hideTeamBudgetForMembers` /
  `hideTeamBudgetForManagers` flags (default `false`, `@visibility frontend`,
  exposed via `GET /config`). When set, the backend redacts
  `max_budget`/`spend` from `GET /teams` (member flag) and
  `GET /teams/managed` plus team write responses (manager flag), emits
  `budget_pct` / `budget_status` / `budget_hidden` instead, and zeroes spend
  in `GET /teams/:id/usage` for affected callers so the cap cannot be
  derived as `spend / pct`. Unlimited teams are never redacted.

## 0.12.0

### Minor Changes

- feat: `GET /user/info` and the per-key list now surface `budget_duration`
  (the spend-reset window, e.g. `"30d"`) on the user record and on each
  virtual key, passing through the LiteLLM field. The frontend budget
  widget uses it to show whether a limit resets (and how often) or never
  resets.

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
