# Configuration

All settings live under the `litellm` key of `app-config.yaml`. Only `baseUrl`
and `masterKey` are required; every feature beyond self-service keys is off
until you turn it on. The schema ships with the backend package
(`config.d.ts`), so `backstage-cli config:check` validates it.

## Environment Variables

Set these in your shell or deployment environment before starting Backstage. Backstage's config system supports `${ENV_VAR}` substitution in `app-config.yaml`:

```bash
LITELLM_BASE_URL=http://litellm-proxy:4000     # LiteLLM proxy URL
LITELLM_MASTER_KEY=sk-...                      # LiteLLM admin master key
```

## App Config Schema

Add to `app-config.yaml`. All keys live under the `litellm` top-level namespace:

```yaml
litellm:
  # Required — base URL of your LiteLLM proxy instance.
  # @visibility backend
  baseUrl: ${LITELLM_BASE_URL}

  # Optional — publicly reachable LiteLLM proxy URL, used to build
  # ready-to-paste curl / OpenAI-SDK snippets in the "Key Generated" dialog.
  # Served to the frontend via GET /config. When omitted the UI shows
  # "Endpoint not configured" — the internal baseUrl is never exposed.
  # publicBaseUrl: https://llm-gw.example.com

  # Required — LiteLLM master key for admin operations.
  # Never exposed to the frontend (marked @visibility secret).
  masterKey: ${LITELLM_MASTER_KEY}

  # Optional — email domain appended to the Backstage user entity name to form
  # the LiteLLM user_id. When set, a user entity "user:default/john.doe" maps
  # to "john.doe@example.com" in LiteLLM. Omit to use the bare entity name.
  # @visibility backend
  userIdDomain: example.com   # optional

  # Optional — autoprovisioning of LiteLLM users on first access.
  provisioning:
    # Whether to automatically create a LiteLLM user when the Backstage user
    # is not yet known to LiteLLM. Disabled by default.
    enabled: false   # default

    defaults:
      # Max lifetime spend (USD) before the account is blocked.
      maxBudget: 10          # default: 10

      # Spend-reset period after which the spend counter resets.
      # Accepts LiteLLM duration strings: "30d", "7d", "1h", etc.
      budgetDuration: 30d    # default: "30d"

      # LiteLLM model IDs the new user is allowed to call.
      # An empty list means all models configured in the proxy are allowed.
      models: []             # default: [] (all models)

      # LiteLLM team IDs to enrol the new user in automatically.
      teams: []              # default: [] (no teams)

      # LiteLLM role assigned to every provisioned user.
      # Valid values: proxy_admin, proxy_admin_viewer, internal_user,
      #               internal_user_viewer, team.
      userRole: internal_user   # default: "internal_user"

      # Tokens per minute hard cap (omit for no per-user limit).
      # tpmLimit: 100000

      # Requests per minute hard cap (omit for no per-user limit).
      # rpmLimit: 1000

      # Arbitrary key-value metadata stored on the LiteLLM user record.
      # metadata:
      #   cost_centre: engineering

    # Optional — role-based provisioning overrides.
    # Evaluated in order; first matching group wins.
    # Fields omitted here fall back to defaults above.
    roles:
      - group: group:default/ai-power-users   # Backstage group entity ref
        maxBudget: 100
        budgetDuration: 30d
        models:
          - gpt-4o
          - claude-3-5-sonnet
        userRole: internal_user

  # Optional — controls for the "Generate New Key" form in the frontend.
  keyGeneration:
    # Show the "Unlimited budget" checkbox. When false, a positive max
    # budget is always required.
    allowUnlimitedBudget: false   # default

    # Require a team to be selected before a key can be generated.
    # Set to false to allow personal, team-less keys.
    teamRequired: true   # default

  # Optional — hide real team budget dollars while still showing the level
  # of consumption (percent of cap, ok/near/over status, reset window).
  # The two flags are independent and enforced server-side (the backend
  # redacts max_budget/spend, including team usage spend so the budget
  # cannot be derived as spend / pct).
  display:
    # Hide dollars from regular team members (Teams cards, TEAM budget
    # meters, team daily-spend chart). Managers still see dollars unless
    # hideTeamBudgetForManagers is also set.
    hideTeamBudgetForMembers: false   # default

    # Hide dollars even from team managers (managed teams, write responses,
    # team usage). The ManageTeamDialog budget field becomes write-only:
    # blank keeps the current value, a new value overwrites it.
    hideTeamBudgetForManagers: false  # default

  # Optional — delegated team management (see "Team Management" below).
  # The whole feature is fail-closed: it stays dark unless `permission.enabled`
  # is true AND `group` is set. Every list below is an allowlist that starts
  # empty (nothing assignable) — you must populate it explicitly.
  teamAdmin:
    # REQUIRED to enable the feature. Backstage group whose members may manage
    # teams. The plugin ships an empty group at catalog/litellm-team-admins.yaml.
    group: group:default/litellm-team-admins

    # Models / access-groups a team admin may put on a team.
    allowedModels: [gpt-4o, claude-3-5-sonnet]   # default: []
    allowedModelAccessGroups: []                 # default: []

    # Hard USD ceiling a team admin may set as a team budget.
    maxBudgetCeiling: 500                         # default: unset (no budget settable)
    allowUnlimitedBudget: false                   # default: false

    # Allow DELETE /teams/:id (otherwise the route 403s — block the team in LiteLLM instead).
    allowTeamDelete: false                        # default: false

    # Refuse every team write, admins included (teams synced from an IdP).
    readOnly: false                               # default: false
    # When set, only members of one of these groups (on top of `group`) may create teams.
    createGroups: []                              # default: []
    # LiteLLM team roles that may add/remove members of their own team.
    memberManagerRoles: []                        # default: [] (off)

    # Knowledge-base (vector store) and MCP-server management. Highest-risk
    # surface — only enable with a real permission policy installed.
    objectPermissions:
      enabled: false                             # default: false
    allowedVectorStores: []                      # default: []  (vector store ids/names)
    allowedMcpServers: []                        # default: []  (MCP server ids/names)
    allowedMcpAccessGroups: []                   # default: []
```

**Config key reference:**

| Key | Type | Required | Default | Description |
|-----|------|----------|---------|-------------|
| `litellm.baseUrl` | string | yes | — | LiteLLM proxy base URL |
| `litellm.publicBaseUrl` | string | no | — | Publicly reachable proxy URL for snippet generation |
| `litellm.masterKey` | string | yes | — | Admin master key (`@visibility secret`) |
| `litellm.userIdDomain` | string | no | — | Email domain for LiteLLM user IDs |
| `litellm.provisioning.enabled` | boolean | no | `false` | Enable autoprovisioning |
| `litellm.provisioning.defaults.maxBudget` | number | no | `10` | Max spend (USD) per reset period |
| `litellm.provisioning.defaults.budgetDuration` | string | no | `"30d"` | Spend-reset period |
| `litellm.provisioning.defaults.models` | string[] | no | `[]` | Allowed model IDs (empty = all) |
| `litellm.provisioning.defaults.teams` | string[] | no | `[]` | Team IDs to join on creation |
| `litellm.provisioning.defaults.userRole` | string | no | `"internal_user"` | LiteLLM role |
| `litellm.provisioning.defaults.tpmLimit` | number | no | — | Tokens-per-minute cap |
| `litellm.provisioning.defaults.rpmLimit` | number | no | — | Requests-per-minute cap |
| `litellm.provisioning.defaults.metadata` | object | no | `{}` | Extra metadata on user record |
| `litellm.provisioning.roles[].group` | string | yes* | — | Backstage group entity ref |
| `litellm.provisioning.roles[].maxBudget` | number | no | — | Overrides default for group |
| `litellm.provisioning.roles[].budgetDuration` | string | no | — | Overrides default for group |
| `litellm.provisioning.roles[].models` | string[] | no | — | Overrides default for group |
| `litellm.provisioning.roles[].teams` | string[] | no | — | Overrides default for group |
| `litellm.provisioning.roles[].userRole` | string | no | — | Overrides default for group |
| `litellm.provisioning.roles[].tpmLimit` | number | no | — | Overrides default for group |
| `litellm.provisioning.roles[].rpmLimit` | number | no | — | Overrides default for group |
| `litellm.provisioning.roles[].metadata` | object | no | — | Merged over default metadata |
| `litellm.keyGeneration.allowUnlimitedBudget` | boolean | no | `false` | Show the "Unlimited budget" checkbox in the Generate New Key form |
| `litellm.keyGeneration.teamRequired` | boolean | no | `true` | Require a team to be selected before a key can be generated |
| `litellm.keys.maxBudget` | number | no | `100` | Server-side ceiling (USD) for a key's `max_budget` on generate/update |
| `litellm.keys.maxTpm` | number | no | `100000` | Server-side ceiling for a key's tokens-per-minute limit |
| `litellm.keys.maxRpm` | number | no | `1000` | Server-side ceiling for a key's requests-per-minute limit |
| `litellm.keys.allowedDurations` | string[] | no | `['1d','7d','30d','90d']` | Durations a key may be generated with (an empty list allows any `<n><s/m/h/d/w/y>`) |
| `litellm.keys.allowedBudgetDurations` | string[] | no | `['1d','7d','30d','1mo']` | `budget_duration` values (budget reset period) a key may be generated with (an empty list allows any `<n><s/m/h/d/mo>`). Keys sent without one never reset |
| `litellm.keys.allowOwnerResetSpend` | boolean | no | `false` | Let key owners reset their own key's spend (still needs the `litellm.key.resetSpend` permission). Fails closed even under an allow-all policy |
| `litellm.cache.userInfoTtlSeconds` | number | no | `10` | TTL of the per-user LiteLLM profile cache (`0` disables) |
| `litellm.audit.group` | string | no | — | Backstage group whose members see the Audit Log tab and may call `/audit` and `/provisioning/preview` |
| `litellm.bridge.enabled` | boolean | no | `false` | Mount the [CLI bridge](cli-bridge.md) routes |
| `litellm.bridge.issuer` | string | when bridge enabled | — | Keycloak realm issuer URL |
| `litellm.bridge.clientId` | string | no | `abby-cli` | OIDC client the CLI tokens must be issued for (`azp` / `aud`) |
| `litellm.bridge.allowedEmailDomains` | string[] | no | `[userIdDomain]` | Verified email domains allowed to use the bridge |
| `litellm.supportContact` | string | no | — | Who users should contact when their account isn't set up (shown in the UI) |
| `litellm.opencode.enabled` | boolean | no | `false` | Mount `/opencode/connect` (see [Security model](../SECURITY.md#security-model)) |
| `litellm.opencode.keyDuration` / `maxBudget` / `requireTeam` / `metadata` | — | no | `30d` / `50` / `false` / `{}` | Defaults for keys created through the OpenCode connect flow |
| `litellm.display.hideTeamBudgetForMembers` | boolean | no | `false` | Hide team budget dollars from members (percent + status still shown, enforced server-side) |
| `litellm.display.hideTeamBudgetForManagers` | boolean | no | `false` | Hide team budget dollars even from managers (budget field becomes write-only) |
| `litellm.teamAdmin.group` | string | no† | — | Backstage group whose members may manage teams. Setting this + `permission.enabled` enables the feature |
| `litellm.teamAdmin.allowedModels` | string[] | no | `[]` | Models a team admin may assign to a team |
| `litellm.teamAdmin.allowedModelAccessGroups` | string[] | no | `[]` | Model access-group names a team admin may assign |
| `litellm.teamAdmin.maxBudgetCeiling` | number | no | — | Hard USD ceiling for an admin-set team budget |
| `litellm.teamAdmin.allowUnlimitedBudget` | boolean | no | `false` | Let an admin create a team with no budget cap |
| `litellm.teamAdmin.allowTeamDelete` | boolean | no | `false` | Enable `DELETE /teams/:id` |
| `litellm.teamAdmin.readOnly` | boolean | no | `false` | Refuse every team write, admins included; reads keep working |
| `litellm.teamAdmin.createGroups` | string[] | no | `[]` | Narrow team creation to members of these groups (in addition to `group`) |
| `litellm.teamAdmin.memberManagerRoles` | string[] | no | `[]` | LiteLLM team roles (e.g. `admin`) allowed to add/remove members of their own team |
| `litellm.teamAdmin.objectPermissions.enabled` | boolean | no | `false` | Enable knowledge-base / MCP management routes |
| `litellm.teamAdmin.allowedVectorStores` | string[] | no | `[]` | Vector stores a team admin may attach as knowledge bases |
| `litellm.teamAdmin.allowedMcpServers` | string[] | no | `[]` | MCP servers a team admin may attach |
| `litellm.teamAdmin.allowedMcpAccessGroups` | string[] | no | `[]` | MCP access-group names a team admin may attach |

*required when the `roles` array is present
†required to enable team management

## Autoprovisioning

When `litellm.provisioning.enabled` is `true`, the backend automatically creates a LiteLLM user the first time a Backstage user hits any plugin endpoint (user info, keys, teams, or usage). The flow is:

1. The backend resolves the caller's Backstage identity from the request token (`user:default/<name>`).
2. It checks whether that identity already exists in LiteLLM via `/user/info`.
3. If not found, it looks up the user's Backstage catalog entity to fetch their profile (email, display name) and group memberships.
4. It applies any matching `provisioning.roles` override (first match wins), then calls `/user/new` on LiteLLM with the effective defaults.
5. A concurrent single-flight lock prevents duplicate `/user/new` calls when several endpoints fire in parallel on the same page load.

**Backstage catalog prerequisites:**

- The user **must exist as a `User` entity in the Backstage catalog**. The catalog is the source of truth for email, display name, and group memberships.
- Group memberships (used for role matching) are resolved from the `memberOf` relations on the user entity. These are typically populated by a catalog provider such as the LDAP, GitHub, or Microsoft Graph org provider.
- If `userIdDomain` is set, the entity name (e.g. `john.doe` from `user:default/john.doe`) is combined with the domain to produce the LiteLLM `user_id` (e.g. `john.doe@example.com`). Make sure LiteLLM users were created with matching IDs if you are migrating an existing deployment.
- If a user signs in without a catalog entity (e.g. `dangerouslyAllowSignInWithoutUserInCatalog` is set), provisioning still proceeds but the LiteLLM user record will lack email, display name, and team-role resolution — they will receive the default settings.

**Minimum working example with autoprovisioning enabled:**

```yaml
litellm:
  baseUrl: ${LITELLM_BASE_URL}
  masterKey: ${LITELLM_MASTER_KEY}
  provisioning:
    enabled: true
    defaults:
      maxBudget: 5
      budgetDuration: 30d
```
