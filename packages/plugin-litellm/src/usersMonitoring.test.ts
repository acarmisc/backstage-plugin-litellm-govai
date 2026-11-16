import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateUsers, byTag, byUserAgent, clientName } from './usersMonitoring';

const row = (o: object) => ({
  requestId: 'r', model: 'm', spend: 1, promptTokens: 2, completionTokens: 3,
  totalTokens: 5, status: 'success', cacheHit: false, timestamp: 't', ...o,
});

const usage = (o: object) => ({
  keyHash: 'k', spend: 1, promptTokens: 2, completionTokens: 3, totalTokens: 5, requests: 2, ...o,
});

test('aggregateUsers maps one row per key', () => {
  const out = aggregateUsers([
    usage({ userId: 'a', userEmail: 'a@x.io', teamId: 't1', keyHash: 'k1', spend: 3 }),
    usage({ keyHash: 'k2', keyAlias: 'ci-bot', teamId: 't1' }),
  ] as any);
  assert.deepEqual(out.map(u => u.id), ['a|t1|k1', 'service|t1|k2']);
  assert.deepEqual([out[0].userId, out[0].userEmail, out[0].spend, out[0].serviceKey], ['a', 'a@x.io', 3, false]);
  assert.equal(out[1].serviceKey, true);
});

test('same user in two teams gives two rows; key without userId falls back to alias', () => {
  const out = aggregateUsers([
    usage({ userId: 'a', teamId: 't1', keyHash: 'k1' }),
    usage({ userId: 'a', teamId: 't2', keyHash: 'k2' }),
    usage({ keyHash: 'abcdef123456', keyAlias: 'ci-bot' }),
  ] as any);
  assert.equal(out.filter(u => u.userId === 'a').length, 2);
  assert.equal(out[2].userId, 'ci-bot');
  assert.equal(out[2].keyAlias, 'ci-bot');
  assert.equal(out[2].serviceKey, true);
});

test('missing user agent / tags never throw', () => {
  const rows = [row({ userId: 'a' }), row({ userAgent: 'OpenCode/1.2 (x)', tags: ['x', 'y'] })] as any;
  assert.deepEqual(byUserAgent(rows).map(r => r.name).sort(), ['OpenCode', 'unknown']);
  assert.deepEqual(byTag(rows).map(r => r.name).sort(), ['x', 'y']);
  assert.equal(clientName(undefined), 'unknown');
});
