# Permissions and team management

Who may do what with keys and teams: the `litellm.*` permissions, the
delegated team administration for an admin group, and hiding team budgets.

## Permissions

The backend registers the following permissions with Backstage's
[permission framework](https://backstage.io/docs/permissions/overview).
Without a permission policy installed (e.g.
[`@backstage-community/plugin-rbac`](https://github.com/backstage/community-plugins/tree/main/workspaces/rbac)
or a custom `PermissionPolicy`), every request is allowed by default —
wiring these up only restricts behavior once you opt in.

| Permission | Guards | Notes |
|---|---|---|
| `litellm.key.create` | `POST /keys/generate` | |
| `litellm.key.revoke` | `DELETE /keys/:keyId`, `POST /keys/prune-expired` | |
| `litellm.key.manage` | `POST /keys/:keyId/update`, `/block` | |
| `litellm.key.resetSpend` | `POST /keys/:keyId/reset_spend` | Also needs `litellm.keys.allowOwnerResetSpend: true` — the flag is checked first and fails closed |
| `litellm.key.unblock` | `POST /keys/:keyId/unblock` | Required for **every** unblock (the caller must also own the key). Owners are not trusted to lift a block on their own say-so — grant this only to roles that may lift blocks; everyone else asks an administrator |
| `litellm.audit.read` | `GET /audit` | Additive to the existing `litellm.audit.group` check — both must pass |
| `litellm.team.create` | `POST /teams` | Team management — see [Team Management](#team-management-litellm-team-admins) |
| `litellm.team.manage` | `PATCH /teams/:id`, `GET /teams/managed` | |
| `litellm.team.members.manage` | `POST` / `DELETE /teams/:id/members` | |
| `litellm.team.knowledgebase.manage` | `GET /vector-stores`, `PUT /teams/:id/knowledge-bases` | Needs `litellm.teamAdmin.objectPermissions.enabled` |
| `litellm.team.mcp.manage` | `GET /mcp-servers`, `PUT /teams/:id/mcp-servers` | Needs `litellm.teamAdmin.objectPermissions.enabled` |
| `litellm.team.delete` | `DELETE /teams/:id` | Needs `litellm.teamAdmin.allowTeamDelete` |

All key-mutation routes still enforce the existing ownership guard (a caller
can only ever act on keys they own) regardless of permission policy. The
`litellm.team.*` routes are **fail-closed**: they return `403` unless the
permission framework is on (`permission.enabled: true`) *and*
`litellm.teamAdmin.group` is set *and* the caller is both a member of that
group and granted the permission — see [Team Management](#team-management-litellm-team-admins).

## Team Management (`litellm-team-admins`)

Lets a designated Backstage group create and run LiteLLM teams from the
**Teams** tab — set the team's models, budget, members, and (optionally)
knowledge bases and MCP servers — without holding the LiteLLM master key.

### How authorization works

Every `litellm.team.*` route runs **three** checks and all must pass:

1. **Feature gate** — `permission.enabled: true` *and* `litellm.teamAdmin.group`
   set. Missing either → the routes 403 and the UI controls are hidden.
2. **Group membership** — the caller is a member of `litellm.teamAdmin.group`
   (resolved from the catalog `memberOf` relations).
3. **Permission decision** — the permission policy `ALLOW`s the specific
   `litellm.team.*` permission. With no policy installed this defaults to
   `ALLOW`, which is why check 2 exists as a hard backstop.

On top of that, `PATCH` / `DELETE` / member / KB / MCP routes enforce an
**object guard**: the team's `metadata.owning_group` (stamped at creation)
must be a group the caller belongs to. Teams created outside this plugin have
no `owning_group` and are read-only here.

Server-side, an admin can only ever assign models in `allowedModels` /
`allowedModelAccessGroups`, a budget `≤ maxBudgetCeiling`, and knowledge
bases / MCP servers in the corresponding allowlists — anything else is a
`400`, never silently dropped.

### Delegating member management to a team role

`memberManagerRoles: [admin]` lets anyone holding that LiteLLM team role
(`members_with_roles[].role`) add and remove members of **their own** team
from the Teams tab, without being in `litellm.teamAdmin.group`. They get a
**Manage members** action that opens a members-only dialog; team settings stay
out of reach. Server-side, on this path:

- only the member routes are open — `PATCH` / `DELETE` of the team, KB and MCP
  still require the admin group;
- members are added with the `user` role, and `maxBudgetInTeam` is refused;
- a manager cannot remove themselves nor another member holding a manager role;
- the permission policy must still `ALLOW` `litellm.team.members.manage` for
  these users (with RBAC, bind it to a role they hold).

Audit events (`team.member.add` / `team.member.remove`) carry `via: group | teamRole`.

### Read-only mode (teams synced from an identity provider)

When teams and memberships are owned elsewhere — e.g. a reconciler that mirrors
Keycloak groups into LiteLLM — set `readOnly: true`. Every team write
(create, edit, delete, members, KB / MCP) returns `403` for everyone,
admins included, and the UI shows a *Synced from identity provider* badge
instead of the edit controls. Reads keep working, so allowlists and the rest
of the `teamAdmin` block can stay in place.

### Granting the capability with `@backstage-community/plugin-rbac`

1. Register the shipped group and point config at it:

   ```yaml
   permission:
     enabled: true
   litellm:
     teamAdmin:
       group: group:default/litellm-team-admins
       allowedModels: [gpt-4o]
       maxBudgetCeiling: 500
   ```

2. Grant the permissions to a role and bind the group to it. As a
   `permission.rbac.policies-csv-file`:

   ```csv
   p, role:default/litellm-team-admin, litellm.team.create, create, allow
   p, role:default/litellm-team-admin, litellm.team.manage, update, allow
   p, role:default/litellm-team-admin, litellm.team.members.manage, update, allow
   p, role:default/litellm-team-admin, litellm.team.knowledgebase.manage, update, allow
   p, role:default/litellm-team-admin, litellm.team.mcp.manage, update, allow
   p, role:default/litellm-team-admin, litellm.team.delete, delete, allow
   g, group:default/litellm-team-admins, role:default/litellm-team-admin
   ```

   Drop the `knowledgebase` / `mcp` / `delete` lines you don't want to delegate.

Without the RBAC plugin, the feature still works as a pure group gate (checks
1 + 2) — the same model the audit tab uses — but you cannot then scope
individual `litellm.team.*` permissions per role.

### Mapping a Keycloak group to the admin group

Team-admin membership is read from the **catalog**, so ingest the Keycloak
group with
[`@backstage/plugin-catalog-backend-module-keycloak`](https://backstage.io/docs/integrations/keycloak/) and
normalize its name with a `groupTransformer`:

```ts
keycloakBackendModule.setGroupTransformer(async (entity, group) => {
  if (group.name === 'litellm-team-admins') {
    entity.metadata.name = 'litellm-team-admins';
    entity.metadata.namespace = 'default';
  }
  return entity;
});
```

Then `litellm.teamAdmin.group: group:default/litellm-team-admins`. Membership
is managed entirely in Keycloak; the catalog sync propagates it. (An OIDC
`groups` token claim alone is **not** enough — the checks read catalog
relations, not token claims.)

### Security notes

- **Knowledge bases** expose their documents to every key in the team;
  **MCP servers** grant those keys tool execution through the model. Both are
  behind `litellm.teamAdmin.objectPermissions.enabled` (default off) and their
  own allowlists, and every attach/detach emits a
  `team.knowledgebase.set` / `team.mcp.set` audit event.
- `DELETE /teams/:id` is off by default (`allowTeamDelete`), refuses to remove
  a team referenced by `litellm.provisioning` config without `?force=true`,
  and is best avoided — block the team in LiteLLM instead (this plugin has no
  team block action).
- Team / member / access changes appear in the **Audit Log** tab under the
  `Team`, `Team member`, and `Team access (KB / MCP)` table filters.
- `metadata.owning_group` on teams is trusted by the authorization system and
  is editable by LiteLLM admins; guard access to the LiteLLM admin interface accordingly.

## Hiding team budgets (`litellm.display`)

When team budgets are finance-sensitive, `litellm.display` hides the real
dollar amounts while still showing the level of consumption. The two flags
are independent:

- `hideTeamBudgetForMembers` — members see `72% used` + `Over budget` /
  `Near limit` pills + reset window on Teams cards and TEAM budget meters;
  the `Budget` stat reads `Hidden` and the team daily-spend chart is omitted.
- `hideTeamBudgetForManagers` — same treatment on the manager surface
  (managed teams, team write responses, team usage). The ManageTeamDialog
  budget field becomes write-only: blank keeps the current value.

Enforcement is server-side: the backend strips `max_budget`/`spend` from
`GET /teams` (member flag) and `GET /teams/managed` plus team write
responses (manager flag), emits `budget_pct` / `budget_status` /
`budget_hidden` instead, and zeroes spend in `GET /teams/:id/usage` for
affected callers (otherwise `budget = spend / pct` would leak the cap).
Which usage flag applies depends on whether the caller belongs to the team's
`metadata.owning_group` (with team management enabled); catalog failures fail
closed to the member rule.
Unlimited teams (no budget) are never redacted — there are no dollars to
hide.

```yaml
litellm:
  display:
    hideTeamBudgetForMembers: true
    hideTeamBudgetForManagers: false
```
