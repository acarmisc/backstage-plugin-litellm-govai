import { describe, test } from 'node:test';
import assert from 'node:assert';
import { filterKeysByStatus } from './keyFilter';
import { VirtualKey } from './types';

describe('filterKeysByStatus', () => {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000); // 1 day (soon)
  const nextWeek = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000); // 10 days (ok)
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000); // 14 days ago (expired)

  const expiredKey: VirtualKey = {
    key: 'expired-key',
    key_alias: 'expired',
    expires_at: twoWeeksAgo.toISOString(),
    created_at: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    user_id: 'user1',
    max_budget: 100,
    spend: 10,
    tpm_limit: 1000,
    rpm_limit: 100,
  };

  const expiringSoonKey: VirtualKey = {
    key: 'expiring-key',
    key_alias: 'expiring',
    expires_at: tomorrow.toISOString(),
    created_at: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    user_id: 'user1',
    max_budget: 100,
    spend: 10,
    tpm_limit: 1000,
    rpm_limit: 100,
  };

  const validKey: VirtualKey = {
    key: 'valid-key',
    key_alias: 'valid',
    expires_at: nextWeek.toISOString(),
    created_at: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    user_id: 'user1',
    max_budget: 100,
    spend: 10,
    tpm_limit: 1000,
    rpm_limit: 100,
  };

  test('returns all keys when filter is undefined', () => {
    const keys = [expiredKey, expiringSoonKey, validKey];
    const result = filterKeysByStatus(keys, undefined);
    assert.strictEqual(result.length, 3);
  });

  test('returns only expired keys when filter is "expired"', () => {
    const keys = [expiredKey, expiringSoonKey, validKey];
    const result = filterKeysByStatus(keys, 'expired');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].key, 'expired-key');
  });

  test('returns only expiring soon keys when filter is "expiring"', () => {
    const keys = [expiredKey, expiringSoonKey, validKey];
    const result = filterKeysByStatus(keys, 'expiring');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].key, 'expiring-key');
  });

  test('returns empty array when no keys match filter', () => {
    const keys = [validKey];
    const result = filterKeysByStatus(keys, 'expired');
    assert.strictEqual(result.length, 0);
  });

  test('returns empty array when given empty input', () => {
    const result = filterKeysByStatus([], 'expired');
    assert.strictEqual(result.length, 0);
  });
});
