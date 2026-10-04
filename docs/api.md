# Backend API

The backend provides the following endpoints (all prefixed with `/api/litellm`).
A machine-readable OpenAPI 3.1 contract is served at `/api/litellm/openapi.json`
— point any OpenAPI-compatible renderer (Stoplight, Swagger UI, Redoc) at it
instead of maintaining this table by hand.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/config` | GET | Public proxy URL (`null` when `publicBaseUrl` isn't set), key-generation and team-management flags, support contact |
| `/openapi.json` | GET | OpenAPI 3.1 contract for this backend surface |
| `/user/info` | GET | Get current user info and quotas |
| `/keys` | GET | List user's virtual keys |
| `/keys/generate` | POST | Generate a new virtual key |
| `/keys/prune-expired` | POST | Delete the caller's expired keys; returns `{ pruned, failed, failures? }` (`litellm.key.revoke`) |
| `/keys/:keyId` | DELETE | Revoke/delete a virtual key (caller must own it) |
| `/keys/:keyId/update` | POST | Update alias / models / budget / limits (caller must own it) |
| `/keys/:keyId/block` | POST | Suspend a key without revoking it (caller must own it) |
| `/keys/:keyId/unblock` | POST | Re-enable a blocked key (caller must own it) |
| `/keys/:keyId/reset_spend` | POST | Zero out a key's spend counter (caller must own it) |
| `/models` | GET | List available LLM models |
| `/teams` | GET | List teams the current user belongs to |
| `/teams/managed` | GET | List teams whose `owning_group` the caller administers (team-admin only) |
| `/teams` | POST | Create a team (`litellm.team.create`) |
| `/teams/:teamId` | PATCH | Update a team's alias / models / budget (`litellm.team.manage`) |
| `/teams/:teamId` | DELETE | Delete a team (`litellm.team.delete`, needs `allowTeamDelete`) |
| `/teams/:teamId/members` | POST / DELETE | Add / remove a team member (`litellm.team.members.manage`) |
| `/vector-stores` | GET | Allowlisted knowledge bases (`litellm.team.knowledgebase.manage`) |
| `/teams/:teamId/knowledge-bases` | PUT | Set a team's knowledge bases (`litellm.team.knowledgebase.manage`) |
| `/mcp-servers` | GET | Allowlisted MCP servers (`litellm.team.mcp.manage`) |
| `/teams/:teamId/mcp-servers` | PUT | Set a team's MCP servers (`litellm.team.mcp.manage`) |
| `/teams/:teamId/usage` | GET | Usage metrics for a team (`start_date`, `end_date` required) |
| `/usage` | GET | Get usage metrics and analytics for the current user |
| `/audit` | GET | Audit logs (gated by `litellm.audit.group` membership) |
| `/opencode/connect` | GET / POST | OpenCode SSO connect: GET shows a confirmation page (no state change); POST creates or rotates the key and redirects to the local callback (only when `litellm.opencode.enabled`) |
| `/provisioning/preview` | GET | Resolve which role a Backstage group maps to (dry-run, audit-group-gated) |

The UI endpoints above authenticate with the caller's Backstage token. The
`/bridge/*` endpoints authenticate with a Keycloak access token instead and are
listed under [CLI bridge](cli-bridge.md).
