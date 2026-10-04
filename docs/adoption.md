# Adopting the plugin in your organization

The plugin is safe to switch on with the defaults: users only ever act on
their own LiteLLM identity and keys, every limit is checked on the server, and
team management stays off until you enable it. The decisions below are what
you tailor to your organization.

## 1. Decide how Backstage users map to LiteLLM users

The LiteLLM `user_id` is the Backstage user entity name, plus `@<userIdDomain>`
when `litellm.userIdDomain` is set:

| Backstage entity | `userIdDomain` | LiteLLM `user_id` |
|---|---|---|
| `user:default/jane.doe` | `example.com` | `jane.doe@example.com` |
| `user:default/jane.doe` | — | `jane.doe` |
| `user:default/jane.doe@example.com` | (ignored) | `jane.doe@example.com` |

If LiteLLM already has users, pick the setting that reproduces their ids, or
existing keys and spend will not show up. The catalog `User` entity must exist
(it provides email, display name and group memberships).

## 2. Choose how users get into LiteLLM

- **Automatic provisioning** (`litellm.provisioning.enabled: true`): a LiteLLM
  user is created on the first visit, with `provisioning.defaults` (budget,
  reset window, models, teams, role). Use `provisioning.roles` to give catalog
  groups different defaults — for example a larger budget for an AI platform
  group. See [Autoprovisioning](configuration.md#autoprovisioning).
- **Pre-created users** (the default): users must already exist in LiteLLM;
  others see a "not set up" message with `litellm.supportContact`.

## 3. Set the guard rails for self-service keys

| Setting | Default | What it controls |
|---|---|---|
| `litellm.keys.maxBudget` / `maxTpm` / `maxRpm` | `100` / `100000` / `1000` | Ceilings a user may request per key |
| `litellm.keys.allowedDurations` | `1d, 7d, 30d, 90d` | Key lifetimes on offer (keys never default to non-expiring) |
| `litellm.keyGeneration.teamRequired` | `true` | Every key must be bound to one of the user's teams |
| `litellm.keyGeneration.allowUnlimitedBudget` | `false` | Whether a key may have no budget |
| `litellm.keys.allowOwnerResetSpend` | `false` | Whether owners may reset their key's spend |

LiteLLM also enforces user and team budgets; the first cap a request reaches
blocks it.

## 4. Decide who may do what

Without a permission policy every `litellm.*` permission is allowed, which is
fine for "every employee may manage their own keys". Install a policy (for
example [`@backstage-community/plugin-rbac`](https://github.com/backstage/community-plugins/tree/main/workspaces/rbac))
when you need to restrict actions per role — see [Permissions](permissions.md).
Two capabilities are group-gated in addition:

- **Audit log tab**: members of `litellm.audit.group`.
- **Team management**: members of `litellm.teamAdmin.group`, and only with
  `permission.enabled: true` — see [Team management](permissions.md#team-management-litellm-team-admins).

## 5. Roll out

1. Deploy with provisioning on and conservative defaults to a pilot group.
2. Ask the LiteLLM admins to create the teams users should bind keys to (or
   enable [team management](permissions.md#team-management-litellm-team-admins)), and list
   their ids in `provisioning.defaults.teams` / `provisioning.roles[].teams`.
3. Add the [homepage widgets](frontend.md) so people find the page.
4. Optionally enable the [CLI bridge](cli-bridge.md) for command-line clients.
5. Restrict access to the LiteLLM admin UI: it can change anything this plugin
   relies on (for example a team's `owning_group`).

The [interactive architecture diagram](architecture.html)
walks through the main flows step by step.
