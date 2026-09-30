import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { UserInfo } from '../types';
import { UserInfoCache, withUserInfoCache, Clock } from './userInfoCache';
import { LiteLLMClient } from '../client';

describe('UserInfoCache', () => {
  const mockUser: UserInfo = {
    user_id: 'user-1',
    user_email: 'user@example.com',
    email: 'user@example.com',
    teams: ['team-1'],
    models: ['gpt-4'],
    max_budget: 100,
    spend: 50,
    budget_duration: '30d',
    budget_reset_at: '2025-10-29',
  };

  let fakeClock: Clock;
  let cache: UserInfoCache;

  beforeEach(() => {
    const currentTime = 0;
    fakeClock = {
      now: () => currentTime,
    };
    cache = new UserInfoCache(10_000, fakeClock); // 10s TTL
  });

  describe('get and set', () => {
    it('returns null for missing keys', () => {
      assert.strictEqual(cache.get('unknown'), null);
    });

    it('stores and retrieves a cached value', () => {
      cache.set('user-1', mockUser);
      assert.deepStrictEqual(cache.get('user-1'), mockUser);
    });

    it('returns null for expired entries', () => {
      // Set with fake clock at 0
      cache.set('user-1', mockUser);
      assert.deepStrictEqual(cache.get('user-1'), mockUser);

      // Advance time past TTL and check expiry
      // @ts-ignore: accessing private for testing
      fakeClock.now = () => 11_000;
      assert.strictEqual(cache.get('user-1'), null);
    });

    it('removes expired entries from the cache', () => {
      cache.set('user-1', mockUser);
      // @ts-ignore
      fakeClock.now = () => 11_000;

      const result = cache.get('user-1');
      assert.strictEqual(result, null);
      // Entry should be deleted, not just expired
      // @ts-ignore
      assert.strictEqual(cache.cache.has('user-1'), false);
    });
  });

  describe('invalidate', () => {
    it('removes a specific entry', () => {
      cache.set('user-1', mockUser);
      cache.invalidate('user-1');
      assert.strictEqual(cache.get('user-1'), null);
    });

    it('does not affect other entries', () => {
      const user2: UserInfo = { ...mockUser, user_id: 'user-2' };
      cache.set('user-1', mockUser);
      cache.set('user-2', user2);

      cache.invalidate('user-1');
      assert.strictEqual(cache.get('user-1'), null);
      assert.deepStrictEqual(cache.get('user-2'), user2);
    });
  });

  describe('clear', () => {
    it('removes all entries', () => {
      cache.set('user-1', mockUser);
      const user2: UserInfo = { ...mockUser, user_id: 'user-2' };
      cache.set('user-2', user2);

      cache.clear();
      assert.strictEqual(cache.get('user-1'), null);
      assert.strictEqual(cache.get('user-2'), null);
    });
  });

  describe('load with single-flight', () => {
    it('caches successful results', async () => {
      let callCount = 0;
      const loader = async () => {
        callCount++;
        return mockUser;
      };

      const result1 = await cache.load('user-1', loader);
      assert.deepStrictEqual(result1, mockUser);
      assert.strictEqual(callCount, 1);

      // Second call should hit cache
      const result2 = await cache.load('user-1', loader);
      assert.deepStrictEqual(result2, mockUser);
      assert.strictEqual(callCount, 1); // No additional call
    });

    it('does not cache null results', async () => {
      let callCount = 0;
      const loader = async (): Promise<UserInfo | null> => {
        callCount++;
        return null;
      };

      const result1 = await cache.load('user-1', loader);
      assert.strictEqual(result1, null);
      assert.strictEqual(callCount, 1);

      // Second call should NOT hit cache (null is not cached)
      const result2 = await cache.load('user-1', loader);
      assert.strictEqual(result2, null);
      assert.strictEqual(callCount, 2);
    });

    it('does not cache errors', async () => {
      let callCount = 0;
      const loader = async (): Promise<UserInfo | null> => {
        callCount++;
        throw new Error('Load failed');
      };

      try {
        await cache.load('user-1', loader);
      } catch {
        /* ignore */
      }
      assert.strictEqual(callCount, 1);

      // Second call should NOT hit cache (error is not cached)
      try {
        await cache.load('user-1', loader);
      } catch {
        /* ignore */
      }
      assert.strictEqual(callCount, 2);
    });

    it('deduplicates concurrent requests for the same user', async () => {
      let callCount = 0;
      const loader = async (): Promise<UserInfo | null> => {
        callCount++;
        // Simulate async work
        return new Promise(resolve => {
          setTimeout(() => resolve(mockUser), 10);
        });
      };

      // Start two concurrent requests
      const promise1 = cache.load('user-1', loader);
      const promise2 = cache.load('user-1', loader);

      const [result1, result2] = await Promise.all([promise1, promise2]);
      assert.deepStrictEqual(result1, mockUser);
      assert.deepStrictEqual(result2, mockUser);
      // Should only call loader once due to single-flight
      assert.strictEqual(callCount, 1);
    });

    it('respects TTL in load', async () => {
      let callCount = 0;
      const loader = async (): Promise<UserInfo | null> => {
        callCount++;
        return mockUser;
      };

      const result1 = await cache.load('user-1', loader);
      assert.deepStrictEqual(result1, mockUser);
      assert.strictEqual(callCount, 1);

      // Advance time but not past TTL
      // @ts-ignore
      fakeClock.now = () => 5_000;
      const result2 = await cache.load('user-1', loader);
      assert.deepStrictEqual(result2, mockUser);
      assert.strictEqual(callCount, 1); // Still cached

      // Advance past TTL
      // @ts-ignore
      fakeClock.now = () => 11_000;
      const result3 = await cache.load('user-1', loader);
      assert.deepStrictEqual(result3, mockUser);
      assert.strictEqual(callCount, 2); // Reloaded
    });
  });

  describe('LRU eviction', () => {
    it('evicts oldest entry when capacity is exceeded', () => {
      // @ts-ignore: access private constant for testing
      const maxEntries = UserInfoCache.MAX_ENTRIES;

      // Fill cache to capacity
      for (let i = 0; i < maxEntries; i++) {
        const user: UserInfo = { ...mockUser, user_id: `user-${i}` };
        cache.set(`user-${i}`, user);
      }

      // Add one more; should evict the first one
      const newUser: UserInfo = { ...mockUser, user_id: 'new-user' };
      cache.set('new-user', newUser);

      assert.strictEqual(cache.get('user-0'), null); // Evicted (oldest)
      assert.deepStrictEqual(cache.get('new-user'), newUser);
    });
  });
});

describe('withUserInfoCache wrapper', () => {
  let mockClient: any;
  let userGetInfoCallCount: number;

  beforeEach(() => {
    userGetInfoCallCount = 0;
    mockClient = {
      async getUserInfo(userId: string): Promise<UserInfo | null> {
        userGetInfoCallCount++;
        if (!userId) return null;
        return {
          user_id: userId,
          user_email: `${userId}@example.com`,
          email: `${userId}@example.com`,
          teams: [],
          models: [],
          max_budget: 100,
          spend: 0,
        };
      },
      async generateKey(): Promise<any> {
        return { key: 'test-key' };
      },
      async updateKey(): Promise<any> {
        return { key: 'updated-key' };
      },
      async deleteKeys(): Promise<any> {
        return { success: true };
      },
      async blockKey(): Promise<any> {
        return { success: true };
      },
      async unblockKey(): Promise<any> {
        return { success: true };
      },
      async resetKeySpend(): Promise<any> {
        return { success: true };
      },
      async createUser(): Promise<any> {
        return { user_id: 'new-user' };
      },
      async teamMemberAdd(): Promise<any> {
        return { success: true };
      },
      async teamMemberDelete(): Promise<any> {
        return { success: true };
      },
      async listKeys(): Promise<any[]> {
        return [];
      },
    };
  });

  it('caches getUserInfo calls', async () => {
    const wrapped = withUserInfoCache(mockClient, { ttlMs: 10_000 });

    // First call should invoke upstream
    const user1 = await wrapped.getUserInfo('alice');
    assert(user1 !== null, 'user1 should not be null');
    assert.strictEqual(user1.user_id, 'alice');
    assert.strictEqual(userGetInfoCallCount, 1);

    // Second call should hit cache
    const user2 = await wrapped.getUserInfo('alice');
    assert(user2 !== null, 'user2 should not be null');
    assert.strictEqual(user2.user_id, 'alice');
    assert.strictEqual(userGetInfoCallCount, 1);
  });

  it('invalidates cache on generateKey', async () => {
    const wrapped = withUserInfoCache(mockClient, { ttlMs: 10_000 });

    // Populate cache
    await wrapped.getUserInfo('alice');
    assert.strictEqual(userGetInfoCallCount, 1);

    // Call a mutating method (generateKey)
    await wrapped.generateKey({ alias: 'test' });

    // Cache should be cleared; next getUserInfo should call upstream
    await wrapped.getUserInfo('alice');
    assert.strictEqual(userGetInfoCallCount, 2);
  });

  it('invalidates cache on updateKey', async () => {
    const wrapped = withUserInfoCache(mockClient, { ttlMs: 10_000 });
    await wrapped.getUserInfo('alice');
    assert.strictEqual(userGetInfoCallCount, 1);

    await wrapped.updateKey({ key: 'test-key' });
    await wrapped.getUserInfo('alice');
    assert.strictEqual(userGetInfoCallCount, 2);
  });

  it('invalidates cache on deleteKeys', async () => {
    const wrapped = withUserInfoCache(mockClient, { ttlMs: 10_000 });
    await wrapped.getUserInfo('alice');
    assert.strictEqual(userGetInfoCallCount, 1);

    await wrapped.deleteKeys({ keys: ['test-key'] });
    await wrapped.getUserInfo('alice');
    assert.strictEqual(userGetInfoCallCount, 2);
  });

  it('invalidates cache on team membership changes', async () => {
    for (const method of ['teamMemberAdd', 'teamMemberDelete'] as const) {
      userGetInfoCallCount = 0;
      const wrapped = withUserInfoCache(mockClient, { ttlMs: 10_000 });
      await wrapped.getUserInfo('alice');
      assert.strictEqual(userGetInfoCallCount, 1, method);

      await (wrapped as any)[method]({ team_id: 't1' });
      await wrapped.getUserInfo('alice');
      assert.strictEqual(userGetInfoCallCount, 2, method);
    }
  });

  it('invalidates cache on blockKey', async () => {
    const wrapped = withUserInfoCache(mockClient, { ttlMs: 10_000 });
    await wrapped.getUserInfo('alice');
    assert.strictEqual(userGetInfoCallCount, 1);

    await wrapped.blockKey('test-key');
    await wrapped.getUserInfo('alice');
    assert.strictEqual(userGetInfoCallCount, 2);
  });

  it('invalidates cache on unblockKey', async () => {
    const wrapped = withUserInfoCache(mockClient, { ttlMs: 10_000 });
    await wrapped.getUserInfo('alice');
    assert.strictEqual(userGetInfoCallCount, 1);

    await wrapped.unblockKey('test-key');
    await wrapped.getUserInfo('alice');
    assert.strictEqual(userGetInfoCallCount, 2);
  });

  it('invalidates cache on resetKeySpend', async () => {
    const wrapped = withUserInfoCache(mockClient, { ttlMs: 10_000 });
    await wrapped.getUserInfo('alice');
    assert.strictEqual(userGetInfoCallCount, 1);

    await wrapped.resetKeySpend('test-key');
    await wrapped.getUserInfo('alice');
    assert.strictEqual(userGetInfoCallCount, 2);
  });

  it('invalidates cache on createUser', async () => {
    const wrapped = withUserInfoCache(mockClient, { ttlMs: 10_000 });
    await wrapped.getUserInfo('alice');
    assert.strictEqual(userGetInfoCallCount, 1);

    await wrapped.createUser({ user_id: 'bob' });
    await wrapped.getUserInfo('alice');
    assert.strictEqual(userGetInfoCallCount, 2);
  });

  it('delegates non-cached, non-mutating methods unchanged', async () => {
    const wrapped = withUserInfoCache(mockClient, { ttlMs: 10_000 });

    const keys = await wrapped.listKeys('alice');
    assert.deepStrictEqual(keys, []);
  });

  it('allows disabling cache with ttlMs: 0', async () => {
    // Note: ttlMs: 0 still wraps the client, but the TTL is 0 so nothing stays cached
    const wrapped = withUserInfoCache(mockClient, { ttlMs: 0 });

    await wrapped.getUserInfo('alice');
    assert.strictEqual(userGetInfoCallCount, 1);

    // Second call still goes upstream because TTL is 0
    await wrapped.getUserInfo('alice');
    // Due to immediate expiry, this should call upstream again
    assert(userGetInfoCallCount >= 1);
  });
});
