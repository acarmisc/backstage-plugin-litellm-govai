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

export const litellmKeyResetSpendPermission = createPermission({
  name: 'litellm.key.resetSpend',
  attributes: { action: 'update' },
});

export const litellmKeyUnblockPermission = createPermission({
  name: 'litellm.key.unblock',
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

/**
 * Read the per-member usage breakdown of a team the caller belongs to.
 * Only consulted when `litellm.teamUsage.memberBreakdown.enabled` is true and
 * the permission framework is enabled.
 */
export const litellmTeamUsageReadPermission = createPermission({
  name: 'litellm.team.usage.read',
  attributes: { action: 'read' },
});

export const litellmPermissions = [
  litellmKeyCreatePermission,
  litellmKeyRevokePermission,
  litellmKeyManagePermission,
  litellmKeyResetSpendPermission,
  litellmKeyUnblockPermission,
  litellmAuditReadPermission,
  litellmTeamCreatePermission,
  litellmTeamManagePermission,
  litellmTeamMembersManagePermission,
  litellmTeamKnowledgebaseManagePermission,
  litellmTeamMcpManagePermission,
  litellmTeamDeletePermission,
  litellmTeamUsageReadPermission,
];
