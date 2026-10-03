# Architecture

An interactive version of this page is in [`architecture.html`](architecture.html)
(open it in a browser: pick a flow, press <kbd>Space</kbd> to play it step by
step, press <kbd>O</kbd> to switch between "no permission policy" and "RBAC").

## Components

| Component | What it is | Holds secrets? |
|---|---|---|
| **Developer (browser)** | A user signed in to Backstage. | No |
| **CLI client** | The Abby CLI or any script using the [CLI bridge](../../README.md#cli-bridge). | Only its own Keycloak token and the keys it mints |
| **Frontend plugin** (`@acarmisc/backstage-plugin-litellm`) | The `/litellm` page and the homepage widgets. Talks only to the backend plugin. | No |
| **Backend plugin** (`@acarmisc/backstage-plugin-litellm-backend`) | Express router mounted at `/api/litellm`. Resolves the caller, enforces every rule, then calls LiteLLM. | The LiteLLM **master key** |
| **Permission framework** | Backstage permissions. With no policy installed every decision is `ALLOW`; with a policy (for example the RBAC plugin) you decide per role. | No |
| **Software Catalog** | Source of user profiles (email, display name) and `memberOf` group relations. | No |
| **Keycloak** (or another OIDC provider) | Signs users in to Backstage; the CLI bridge verifies its access tokens against the realm JWKS. | — |
| **LiteLLM proxy** | Stores users, teams, keys, budgets and spend. Called only by the backend plugin, with the master key. | — |

The master key never leaves the backend. The frontend learns the public proxy
URL (`litellm.publicBaseUrl`) only to build copy-paste snippets.

## Flows

### 1. Generate a key from the UI

1. The developer opens **Generate New Key**. The dialog offers only allowed
   durations, the caller's teams and the selected team's models.
2. The frontend calls `POST /api/litellm/keys/generate` with the Backstage user
   token. The body is parsed with a strict schema: unknown fields (for example
   `user_id`) are rejected with `400`.
3. The backend checks the `litellm.key.create` permission.
4. It resolves the caller's LiteLLM user (`user:default/jane.doe` +
   `userIdDomain` → `jane.doe@example.com`), provisioning it if enabled.
5. It enforces the rules server-side: the team must be one of the caller's
   teams, the models must be allowed for that team, budget / TPM / RPM /
   duration must be within `litellm.keys.*`.
6. It calls LiteLLM `POST /key/generate` with an explicitly built body and
   server-owned metadata (`created_by_backstage_user`, `created_via`, …).
7. The key is shown once, with ready-made snippets.

Updating, blocking, unblocking, resetting spend and deleting a key follow the
same pattern, plus an ownership check: the key must belong to the caller.

### 2. First visit: automatic provisioning

Only when `litellm.provisioning.enabled: true`.

1. A new employee opens `/litellm`; the page loads `/user/info`, `/keys`,
   `/teams` and `/usage` in parallel.
2. The backend accepts only a Backstage **user** principal.
3. LiteLLM answers `404` for the user. Parallel requests join one in-flight
   provisioning call per user.
4. The backend reads the catalog `User` entity (email, display name) and its
   `memberOf` relations; the first matching `litellm.provisioning.roles[]`
   entry overrides the defaults.
5. It calls `POST /user/new` with the effective defaults and provenance
   metadata, without creating a default key.
6. The profile is returned and the UI renders.

### 3. CLI key through the bridge

Only when `litellm.bridge.enabled: true`.

1. The CLI signs the user in to the Keycloak realm as a public client
   (`litellm.bridge.clientId`, default `abby-cli`).
2. Keycloak issues an access token.
3. The CLI calls `POST /api/litellm/bridge/keys` with that token. Bridge routes
   are exempt from Backstage auth and verify the token themselves.
4. The backend verifies signature (JWKS), issuer, client (`azp`/`aud`) and token
   type, then requires a verified email in `litellm.bridge.allowedEmailDomains`.
   The LiteLLM user id is `preferred_username` with `userIdDomain` applied — the
   same id the UI uses.
5. The key goes through the same checks as the UI (schema, ceilings, team,
   models) and is stamped `created_via: abby-cli`. Backstage permissions are
   not evaluated on this path: there is no Backstage credential.
6. The key is returned to the CLI. `GET /bridge/user/info` and
   `GET /bridge/models?team_id=` support team and model pickers.

### 4. Team admin adds a member

Only with `permission.enabled: true` and `litellm.teamAdmin.group` set.

1. A team admin picks a colleague in the Teams tab.
2. `POST /api/litellm/teams/:id/members`. With `litellm.teamAdmin.readOnly`
   every write is refused.
3. The caller must be a direct member of `litellm.teamAdmin.group` (or hold one
   of `memberManagerRoles` in that team).
4. The permission policy must allow `litellm.team.members.manage`.
5. Object guard: the team's `metadata.owning_group` must be a group the caller
   belongs to. Teams created outside Backstage are read-only here.
6. The new member must be a catalog `User`; they are provisioned in LiteLLM if
   needed, with the `user` team role only.
7. LiteLLM `POST /team/member_add`; an audit log line records the change.
8. The updated team is returned, with budget dollars redacted if
   `litellm.display.hideTeamBudgetForManagers` is set.

## Modes in the interactive diagram

| Mode | Meaning |
|---|---|
| **No policy** | `permission.enabled` is false or no policy is installed: every `litellm.*` permission is `ALLOW`. Key rules, ownership checks and config ceilings still apply. Team management is off. |
| **RBAC** | A permission policy decides each `litellm.*` permission per role. Team management can be turned on. |

## Regenerating the diagram

`architecture.html` was generated from the
[architecture-diagram skill](https://github.com/konraddzbik/architecture-diagram-skill)
template. To change it, edit the `.node` blocks and the `flows` object in the
HTML directly, keeping this file in sync.
