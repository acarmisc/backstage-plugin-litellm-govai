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

export const litellmPermissions = [
  litellmKeyCreatePermission,
  litellmKeyRevokePermission,
  litellmKeyManagePermission,
  litellmAuditReadPermission,
];
