import { createPermission } from '@backstage/plugin-permission-common';

export const litellmKeyCreatePermission = createPermission({
  name: 'litellm.key.create',
  attributes: { action: 'create' },
});

export const litellmKeyRevokePermission = createPermission({
  name: 'litellm.key.revoke',
  attributes: { action: 'delete' },
});

export const litellmKeyManagePermission = createPermission({
  name: 'litellm.key.manage',
  attributes: { action: 'update' },
});

export const litellmAuditReadPermission = createPermission({
  name: 'litellm.audit.read',
  attributes: { action: 'read' },
});

// Team-management permissions — delegated to litellm-team-admins group
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

export const litellmTeamDeletePermission = createPermission({
  name: 'litellm.team.delete',
  attributes: { action: 'delete' },
});

export const litellmPermissions = [
  litellmKeyCreatePermission,
  litellmKeyRevokePermission,
  litellmKeyManagePermission,
  litellmAuditReadPermission,
  litellmTeamCreatePermission,
  litellmTeamManagePermission,
  litellmTeamMembersManagePermission,
  litellmTeamKnowledgebaseManagePermission,
  litellmTeamMcpManagePermission,
  litellmTeamDeletePermission,
];
