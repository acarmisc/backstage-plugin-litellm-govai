import { createPermission } from '@backstage/plugin-permission-common';

// NOTE: these MUST stay byte-for-byte in sync with
// packages/plugin-litellm-backend/src/permissions.ts — permission identity is the `name`.
export const litellmTeamCreatePermission = createPermission({
  name: 'litellm.team.create',
  attributes: { action: 'create' },
});

export const litellmTeamManagePermission = createPermission({
  name: 'litellm.team.manage',
  attributes: { action: 'update' },
});

export const litellmTeamMembersManagePermission = createPermission({
  name: 'litellm.team.members.manage',
  attributes: { action: 'update' },
});

export const litellmTeamKnowledgebaseManagePermission = createPermission({
  name: 'litellm.team.knowledgebase.manage',
  attributes: { action: 'update' },
});

export const litellmTeamMcpManagePermission = createPermission({
  name: 'litellm.team.mcp.manage',
  attributes: { action: 'update' },
});
