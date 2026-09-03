import { describe, test } from 'node:test';
import assert from 'node:assert';
import {
  litellmPermissions,
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
} from './permissions';

describe('litellmPermissions', () => {
  test('all permission names are unique', () => {
    const names = litellmPermissions.map(p => p.name);
    const uniqueNames = new Set(names);
    assert.strictEqual(
      names.length,
      uniqueNames.size,
      `Expected all permission names to be unique, but found duplicates: ${names.join(', ')}`,
    );
  });

  test('all permission names start with litellm.', () => {
    for (const perm of litellmPermissions) {
      assert.ok(
        perm.name.startsWith('litellm.'),
        `Expected permission name to start with "litellm.", got "${perm.name}"`,
      );
    }
  });

  test('contains all 4 original key/audit permissions', () => {
    const permNames = litellmPermissions.map(p => p.name);
    assert.ok(permNames.includes('litellm.key.create'));
    assert.ok(permNames.includes('litellm.key.revoke'));
    assert.ok(permNames.includes('litellm.key.manage'));
    assert.ok(permNames.includes('litellm.audit.read'));
  });

  test('contains all 6 new team-management permissions', () => {
    const permNames = litellmPermissions.map(p => p.name);
    assert.ok(permNames.includes('litellm.team.create'));
    assert.ok(permNames.includes('litellm.team.manage'));
    assert.ok(permNames.includes('litellm.team.members.manage'));
    assert.ok(permNames.includes('litellm.team.knowledgebase.manage'));
    assert.ok(permNames.includes('litellm.team.mcp.manage'));
    assert.ok(permNames.includes('litellm.team.delete'));
  });

  test('team.create has action "create"', () => {
    assert.strictEqual(litellmTeamCreatePermission.attributes.action, 'create');
  });

  test('team.manage has action "update"', () => {
    assert.strictEqual(litellmTeamManagePermission.attributes.action, 'update');
  });

  test('team.members.manage has action "update"', () => {
    assert.strictEqual(litellmTeamMembersManagePermission.attributes.action, 'update');
  });

  test('team.knowledgebase.manage has action "update"', () => {
    assert.strictEqual(litellmTeamKnowledgebaseManagePermission.attributes.action, 'update');
  });

  test('team.mcp.manage has action "update"', () => {
    assert.strictEqual(litellmTeamMcpManagePermission.attributes.action, 'update');
  });

  test('team.delete has action "delete"', () => {
    assert.strictEqual(litellmTeamDeletePermission.attributes.action, 'delete');
  });

  test('original permissions still have correct actions', () => {
    assert.strictEqual(litellmKeyCreatePermission.attributes.action, 'create');
    assert.strictEqual(litellmKeyRevokePermission.attributes.action, 'delete');
    assert.strictEqual(litellmKeyManagePermission.attributes.action, 'update');
    assert.strictEqual(litellmAuditReadPermission.attributes.action, 'read');
  });
});
