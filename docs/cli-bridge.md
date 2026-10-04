# CLI bridge

The bridge lets command-line clients (for example the **Abby** CLI) list and
mint LiteLLM virtual keys **without ever holding the LiteLLM master key**. The
Backstage backend keeps the master key; the CLI authenticates with a Keycloak
access token from the same realm Backstage signs users in with.

Request flow for `/api/litellm/bridge/*`:

1. The CLI sends `Authorization: Bearer <keycloak-access-token>`.
2. The bridge verifies the JWT against the realm JWKS: issuer, client (`azp`,
   falling back to `aud`, must equal `litellm.bridge.clientId`) and token type
   (Keycloak's `typ` claim must be absent or `Bearer` — ID tokens are rejected).
   Failure → `401`, with details logged server-side only.
3. The caller needs a **verified email** (`email_verified: true`) in a trusted
   domain: `litellm.bridge.allowedEmailDomains`, defaulting to
   `litellm.userIdDomain`. With neither configured every caller gets `403`.
4. The LiteLLM user is **the same one the UI addresses**: the Keycloak
   `preferred_username` (the Backstage user entity name; an email-shaped
   username in a trusted domain is reduced to its local part) with
   `litellm.userIdDomain` applied. If no such user exists, a user with the
   token's email is reused; otherwise the user is provisioned from the token
   claims when `litellm.provisioning.enabled` (base defaults only — group role
   overrides need the catalog), or the call fails with `404`.
5. Keys go through **the same checks as the UI**: strict request schema,
   `litellm.keys.*` ceilings, `teamRequired`, team membership and allowed
   models. When unlimited budgets are not allowed and the CLI sends no
   `max_budget`, `provisioning.defaults.maxBudget` is used. Minted keys carry
   `created_via: abby-cli`, `created_by` and `created_at_iso` metadata.
   Backstage permissions are not evaluated: there is no Backstage credential to
   authorize.

Because the user id comes from `preferred_username`, make sure users cannot
edit their username in the Keycloak realm (the default).

| Endpoint | Method | Purpose |
|---|---|---|
| `/bridge/health` | GET | Bridge health and configured `clientId` (no auth) |
| `/bridge/user/info` | GET | Caller's `user_id`, team ids and team display names |
| `/bridge/keys` | GET | List the caller's keys |
| `/bridge/keys` | POST | Mint a key for the caller |
| `/bridge/models` | GET | Model catalogue; with `?team_id=` only that team's models (caller must belong to the team) |

Configuration:

```yaml
litellm:
  bridge:
    enabled: true                                   # default false
    issuer: https://auth.example.com/realms/acme    # required when enabled
    clientId: abby-cli                              # default abby-cli
    allowedEmailDomains: [example.com]              # default: [litellm.userIdDomain]
```

When `enabled` is true but `issuer` is missing, the backend logs an error at
startup and does not mount the bridge routes.
