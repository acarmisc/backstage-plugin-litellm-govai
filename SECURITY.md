# Security

## Supported versions

Only the latest release of each package receives security fixes:

- `@acarmisc/backstage-plugin-litellm`
- `@acarmisc/backstage-plugin-litellm-backend`
- `@acarmisc/backstage-plugin-litellm-common`

## Reporting a vulnerability

Use GitHub's
[private vulnerability reporting](https://github.com/acarmisc/backstage-plugin-litellm-govai/security/advisories/new).
Please don't open a public issue. Fixes are best effort, without a
response-time guarantee.

## Threat model

The backend holds the LiteLLM **master key** and acts on behalf of Backstage
users. Reports in these areas are the most useful:

- **Acting as someone else**: reading, changing or creating keys, usage or
  teams of another user — through the UI routes, the CLI bridge or the
  OpenCode connect flow.
- **Escaping a limit**: a key, team or budget beyond the configured ceilings,
  models a team may not use, or a team write without the admin group, the
  permission or the `owning_group` match.
- **Leaking secrets**: the master key, the internal `baseUrl`, plaintext keys or
  upstream error details reaching a browser or a log line.
- **Hidden budgets**: team dollar amounts reaching a caller when
  `litellm.display.hideTeamBudgetFor*` says they should not.

Out of scope: anything that needs the LiteLLM master key or LiteLLM admin
access, which can change every record this plugin relies on.

## Security model

Everything the UI enforces is also enforced by the backend — the server is the
source of truth.

**Who can call what**

- User routes (`/user/info`, `/keys*`, `/teams`, `/usage`, …) require a verified
  **Backstage user** credential. Service and external principals and anonymous
  callers get `401`. The LiteLLM identity is derived only from that credential;
  a `user_id` in the query string or body is never honoured.
- Every key mutation additionally checks that the caller owns the key.

**Key creation and editing** (`POST /keys/generate`, `POST /keys/:id/update`)

- Requests are parsed with a **strict** schema — unknown fields are rejected with
  `400` (for example `team_id`, `spend`, `blocked` or `user_id` on an update). The
  upstream LiteLLM request is built explicitly from the parsed fields, never by
  spreading the request body.
- `litellm.keys.maxBudget` / `maxTpm` / `maxRpm` / `allowedDurations` cap what a
  user can ask for; `litellm.keyGeneration.allowUnlimitedBudget` and `teamRequired`
  are enforced server-side; the `team_id` must be one of the caller's teams and
  the requested models must be within what the team (or, without a team, the
  user) may use.
- Server-owned metadata (`created_by_backstage_user`, `created_via`, …) always
  overrides anything the client sends.

**Sensitive actions**

- Resetting a key's spend needs `litellm.keys.allowOwnerResetSpend: true` **and**
  the `litellm.key.resetSpend` permission.
- Blocking records `metadata.blocked_by` / `blocked_at` for audit purposes only.
  Unblocking always needs `litellm.key.unblock` (plus ownership): the record is
  never used to decide who may lift a block, because an owner could influence it.
- `GET /teams/:teamId/usage` requires membership of the team, or membership of
  the team's `metadata.owning_group` (with team management enabled), and answers
  `404` otherwise, so team existence isn't leaked.
- Blocking an already-blocked key is a `409` and `blocked_by` / `blocked_at` (and
  `created_*` / `updated_*`) metadata can't be set by clients, so the audit
  record can't be overwritten or pre-seeded.
- A key generated without a duration gets `30d` (never a non-expiring key).

**Errors** never pass raw upstream text through: LiteLLM `401`/`403` become `502`
(so an upstream auth failure can't log the Backstage session out), upstream
`5xx` and network failures become a generic `502`, and `4xx` messages are stripped of
HTML, stripped of `Bearer` tokens and `sk-` keys, and capped at 500 characters. `GET /config` exposes `publicBaseUrl` only,
never the internal `baseUrl`.

**OpenCode connect** (`litellm.opencode.enabled`): `GET /opencode/connect` only
renders a confirmation page. The state change happens on `POST`, which creates a
key or **rotates** the existing one via LiteLLM's key regeneration (falling back to
replacing the key on editions without it) and redirects
to the local `http://localhost:<port>/callback` with the new plaintext key —
never a stored hash. Note: the `POST` is not CSRF-token protected beyond the
localhost-only redirect target; the worst a forged request can do is rotate the
signed-in user's OpenCode key.

**Group membership** used for team administration and provisioning roles is
*direct* membership only — nested groups are not resolved.
`metadata.owning_group` on LiteLLM teams is trusted and editable by LiteLLM
admins, so guard the LiteLLM admin interface accordingly.

**Claude Code snippet**: the generated snippet does not embed the key in a
helper script; it reads it from the OS keychain through `apiKeyHelper`.

**CLI bridge** (`litellm.bridge.enabled`): the bridge verifies Keycloak access
tokens itself (signature, issuer, client, token type) and requires a verified
email in an allowed domain. The LiteLLM user id comes from
`preferred_username`, so users must not be able to edit their username in the
realm (Keycloak's default). See [docs/cli-bridge.md](docs/cli-bridge.md).
