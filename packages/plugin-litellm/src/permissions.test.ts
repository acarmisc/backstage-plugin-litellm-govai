import { describe, test } from 'node:test';
import assert from 'node:assert';
import {
  litellmTeamCreatePermission,
  litellmTeamManagePermission,
  litellmTeamMembersManagePermission,
  litellmTeamKnowledgebaseManagePermission,
} from './permissions';

describe('litellm permissions', () => {
  test('litellmTeamCreatePermission has correct name and action', () => {
    assert.strictEqual(litellmTeamCreatePermission.name, 'litellm.team.create');
    assert.strictEqual(litellmTeamCreatePermission.attributes.action, 'create');
  });

  test('litellmTeamManagePermission has correct name and action', () => {
    assert.strictEqual(litellmTeamManagePermission.name, 'litellm.team.manage');
    assert.strictEqual(litellmTeamManagePermission.attributes.action, 'update');
  });

  test('litellmTeamMembersManagePermission has correct name and action', () => {
    assert.strictEqual(
      litellmTeamMembersManagePermission.name,
      'litellm.team.members.manage',
    );
    assert.strictEqual(
      litellmTeamMembersManagePermission.attributes.action,
      'update',
    );
  });

  test('litellmTeamKnowledgebaseManagePermission has correct name and action', () => {
    assert.strictEqual(
      litellmTeamKnowledgebaseManagePermission.name,
      'litellm.team.knowledgebase.manage',
    );
    assert.strictEqual(
      litellmTeamKnowledgebaseManagePermission.attributes.action,
      'update',
    );
  });
});
