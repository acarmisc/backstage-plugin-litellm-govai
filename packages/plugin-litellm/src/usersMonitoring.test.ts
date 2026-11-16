import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateUsers, byTag, byUserAgent, clientName } from './usersMonitoring';

const row = (o: object) => ({
  requestId: 'r', model: 'm', spend: 1, promptTokens: 2, completionTokens: 3,
  totalTokens: 5, status: 'success', cacheHit: false, timestamp: 't', ...o,
});

test('aggregateUsers sums per user and collects teams', () => {
  const [a, b] = aggregateUsers([
    row({ userId: 'a', teamId: 't1' }), row({ userId: 'a', teamId: 't2', spend: 2 }), row({}),
  ] as any).sort((x, y) => x.userId.localeCompare(y.userId));
  assert.deepEqual([a.userId, a.spend, a.requests, a.totalTokens, a.teams], ['a', 3, 2, 10, ['t1', 't2']]);
  assert.equal(b.userId, 'unknown');
});

test('missing user agent / tags never throw', () => {
  const rows = [row({ userId: 'a' }), row({ userAgent: 'OpenCode/1.2 (x)', tags: ['x', 'y'] })] as any;
  assert.deepEqual(byUserAgent(rows).map(r => r.name).sort(), ['OpenCode', 'unknown']);
  assert.deepEqual(byTag(rows).map(r => r.name).sort(), ['x', 'y']);
  assert.equal(clientName(undefined), 'unknown');
});
