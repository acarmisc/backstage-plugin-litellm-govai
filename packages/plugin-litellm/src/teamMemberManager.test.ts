import { describe, test } from 'node:test';
import assert from 'node:assert';
import { isTeamMemberManager } from './teamMemberManager';
import { TeamInfo } from './types';

describe('isTeamMemberManager', () => {
  const mockTeam: TeamInfo = {
    team_id: 'team-1',
    team_alias: 'Test Team',
    spend: 50,
    members_with_roles: [
      { user_id: 'user-1', user_email: 'user1@example.com', role: 'admin' },
      { user_id: 'user-2', user_email: 'user2@example.com', role: 'user' },
    ],
  };

  test('returns false when team is undefined', () => {
    assert.strictEqual(
      isTeamMemberManager(undefined, 'user-1', ['admin'], false),
      false,
    );
  });

  test('returns false when userId is undefined', () => {
    assert.strictEqual(
      isTeamMemberManager(mockTeam, undefined, ['admin'], false),
      false,
    );
  });

  test('returns false when memberManagerRoles is undefined', () => {
    assert.strictEqual(
      isTeamMemberManager(mockTeam, 'user-1', undefined, false),
      false,
    );
  });

  test('returns false when memberManagerRoles is empty', () => {
    assert.strictEqual(
      isTeamMemberManager(mockTeam, 'user-1', [], false),
      false,
    );
  });

  test('returns false when readOnly is true', () => {
    assert.strictEqual(
      isTeamMemberManager(mockTeam, 'user-1', ['admin'], true),
      false,
    );
  });

  test('returns true when user is a team admin and admin is in memberManagerRoles', () => {
    assert.strictEqual(
      isTeamMemberManager(mockTeam, 'user-1', ['admin'], false),
      true,
    );
  });

  test('returns false when user is not in memberManagerRoles', () => {
    assert.strictEqual(
      isTeamMemberManager(mockTeam, 'user-2', ['admin'], false),
      false,
    );
  });

  test('returns true when user has a role in memberManagerRoles', () => {
    assert.strictEqual(
      isTeamMemberManager(mockTeam, 'user-1', ['admin', 'moderator'], false),
      true,
    );
  });

  test('returns false when user is not a member of the team', () => {
    assert.strictEqual(
      isTeamMemberManager(mockTeam, 'user-3', ['admin'], false),
      false,
    );
  });

  test('returns false when team has no members_with_roles', () => {
    const emptyTeam: TeamInfo = { team_id: 'team-2', team_alias: 'Empty Team', spend: 0 };
    assert.strictEqual(
      isTeamMemberManager(emptyTeam, 'user-1', ['admin'], false),
      false,
    );
  });
});
