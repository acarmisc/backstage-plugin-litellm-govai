import { describe, test } from 'node:test';
import assert from 'node:assert';
import {
  buildTeamMemberUsage,
  memberEmails,
  readMemberBreakdownConfig,
  redactTeamMemberUsage,
} from './teamMemberUsage';

const bucket = (spend: number, ok: number, failed = 0) => ({
  key_alias: 'k',
  team_id: 't1',
  models: ['gpt-4'],
  total_spend: spend,
  total_tokens: spend * 100,
  prompt_tokens: spend * 60,
  completion_tokens: spend * 40,
  api_requests: ok + failed,
  successful_requests: ok,
  failed_requests: failed,
});

const usage: any = {
  total_spend: 10,
  usage_by_key: {
    'hash-a1': bucket(3, 3, 1),
    'hash-a2': bucket(2, 2),
    'hash-b': bucket(4, 4),
    'hash-gone': bucket(1, 1),
  },
};
const keys: any[] = [
  { token: 'hash-a1', user_id: 'alice' },
  { token: 'hash-a2', user_id: 'alice' },
  { token: 'hash-b', user_id: 'bob@corp.it' },
  { token: 'hash-idle', user_id: 'carol' },
];
const team: any = {
  team_id: 't1',
  members_with_roles: [
    { user_id: 'alice', user_email: 'alice@corp.it', role: 'admin' },
    { user_id: 'bob@corp.it', role: 'user' },
    { user_id: 'carol', role: 'user' },
    { user_id: 'dave', role: 'user' },
  ],
};

describe('buildTeamMemberUsage', () => {
  const result = buildTeamMemberUsage(
    't1', usage, keys, team,
    new Map([['alice@corp.it', { displayName: 'Alice A.' }]]),
  );
  const row = (id: string | null) => result.members.find(m => m.user_id === id)!;

  test('credits each key to its owner and sums to the team total', () => {
    assert.strictEqual(row('alice').spend, 5);
    assert.strictEqual(row('bob@corp.it').spend, 4);
    assert.strictEqual(result.total_spend, 10);
    assert.strictEqual(result.members.reduce((s, m) => s + m.spend, 0), 10);
  });

  test('puts activity of unknown keys in a null row', () => {
    assert.strictEqual(row(null).spend, 1);
    assert.strictEqual(row(null).key_count, 0);
  });

  test('lists idle members with zero usage and their key count', () => {
    assert.strictEqual(row('carol').spend, 0);
    assert.strictEqual(row('carol').key_count, 1);
    assert.strictEqual(row('carol').success_rate, null);
    assert.strictEqual(row('dave').key_count, 0);
  });

  test('computes shares, success rate, roles and names', () => {
    assert.strictEqual(row('alice').spend_share_pct, 50);
    assert.strictEqual(row('alice').key_count, 2);
    assert.strictEqual(row('alice').role, 'admin');
    assert.strictEqual(row('alice').success_rate, (5 / 6) * 100);
    assert.strictEqual(row('alice').display_name, 'Alice A.');
    assert.strictEqual(row('bob@corp.it').user_email, 'bob@corp.it');
  });

  test('sorts by spend, highest first', () => {
    assert.deepStrictEqual(
      result.members.map(m => m.user_id),
      ['alice', 'bob@corp.it', null, 'carol', 'dave'],
    );
  });

  test('handles a team without activity', () => {
    const empty = buildTeamMemberUsage('t1', { usage_by_key: {} } as any, [], team);
    assert.strictEqual(empty.total_spend, 0);
    assert.ok(empty.members.every(m => m.spend_share_pct === 0));
  });
});

describe('redactTeamMemberUsage', () => {
  test('zeroes dollars and keeps shares', () => {
    const r = redactTeamMemberUsage(buildTeamMemberUsage('t1', usage, keys, team));
    assert.strictEqual(r.budget_hidden, true);
    assert.strictEqual(r.total_spend, 0);
    assert.ok(r.members.every(m => m.spend === 0));
    assert.strictEqual(r.members[0].spend_share_pct, 50);
    assert.ok(r.members[0].total_tokens > 0);
  });
});

describe('memberEmails', () => {
  test('collects roster emails and email-shaped ids, lower-cased', () => {
    assert.deepStrictEqual(
      memberEmails(
        { team_id: 't', members_with_roles: [{ user_id: 'a', user_email: 'A@corp.it', role: 'user' }] } as any,
        [{ user_id: 'b@corp.it' } as any, { user_id: 'c' } as any],
      ),
      ['a@corp.it', 'b@corp.it'],
    );
  });
});

describe('readMemberBreakdownConfig', () => {
  const cfg = (v: Record<string, any>): any => ({
    getOptionalBoolean: (k: string) => v[k],
    getOptionalStringArray: (k: string) => v[k],
  });
  test('defaults to disabled', () => {
    assert.deepStrictEqual(readMemberBreakdownConfig(cfg({})), {
      enabled: false,
      viewerRoles: [],
      permissionEnabled: false,
    });
  });
  test('reads the keys', () => {
    assert.deepStrictEqual(
      readMemberBreakdownConfig(cfg({
        'litellm.teamUsage.memberBreakdown.enabled': true,
        'litellm.teamUsage.memberBreakdown.viewerRoles': ['admin'],
        'permission.enabled': true,
      })),
      { enabled: true, viewerRoles: ['admin'], permissionEnabled: true },
    );
  });
});
