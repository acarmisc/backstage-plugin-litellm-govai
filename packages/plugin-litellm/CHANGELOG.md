# @acarmisc/backstage-plugin-litellm

This changelog is maintained by hand — this repo is two independent npm
packages rather than a Changesets-compatible yarn workspace, so there's no
automated `yarn changeset` release flow. Add an entry here in the same
commit/PR that bumps the version in `package.json`. Format follows the
[Changesets](https://github.com/changesets/changesets) convention used by
`backstage/community-plugins`.

Earlier history: `git log -- packages/plugin-litellm` or the
[GitHub tags](https://github.com/acarmisc/backstage-plugin-litellm-govai/tags).

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
