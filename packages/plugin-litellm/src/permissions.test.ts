import { describe, test } from 'node:test';
import assert from 'node:assert';
import { litellmTeamCreatePermission, litellmTeamManagePermission } from './permissions';

describe('litellm permissions', () => {
  test('litellmTeamCreatePermission has correct name and action', () => {
    assert.strictEqual(litellmTeamCreatePermission.name, 'litellm.team.create');
    assert.strictEqual(litellmTeamCreatePermission.attributes.action, 'create');
  });

  test('litellmTeamManagePermission has correct name and action', () => {
    assert.strictEqual(litellmTeamManagePermission.name, 'litellm.team.manage');
    assert.strictEqual(litellmTeamManagePermission.attributes.action, 'update');
  });
});
