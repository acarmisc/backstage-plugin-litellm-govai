import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert';
import { ProfileCache, Clock } from './profileCache';
import type { LiteLlmApiInterface } from './api';

// Mock clock for time manipulation.
class MockClock implements Clock {
  private time = 0;

  now(): number {
    return this.time;
  }

  advance(ms: number): void {
    this.time += ms;
  }
}

// Mock API instance (just a unique object).
function makeApi(): LiteLlmApiInterface {
  return {} as LiteLlmApiInterface;
}

describe('ProfileCache', () => {
  let cache: ProfileCache;
  let clock: MockClock;

  beforeEach(() => {
    clock = new MockClock();
    cache = new ProfileCache(30_000, clock);
  });

  test('memoises within TTL', async () => {
    const api = makeApi();
    let callCount = 0;

    const fetcher = async () => {
      callCount++;
      return { value: 'result' };
    };

    const result1 = await cache.memoize(api, 'test', fetcher);
    const result2 = await cache.memoize(api, 'test', fetcher);

    assert.strictEqual(callCount, 1, 'fetcher should be called once');
    assert.deepStrictEqual(result1, result2, 'results should be identical');
  });

  test('refetches after TTL expires', async () => {
    const api = makeApi();
    let callCount = 0;

    const fetcher = async () => {
      callCount++;
      return { value: `result-${callCount}` };
    };

    const result1 = await cache.memoize(api, 'test', fetcher);
    assert.strictEqual(result1.value, 'result-1');

    // Advance past TTL.
    clock.advance(31_000);

    const result2 = await cache.memoize(api, 'test', fetcher);
    assert.strictEqual(result2.value, 'result-2', 'should refetch after TTL');
    assert.strictEqual(callCount, 2);
  });

  test('single-flight: concurrent calls share a promise', async () => {
    const api = makeApi();
    let callCount = 0;

    const fetcher = async () => {
      callCount++;
      return { value: 'concurrent-result' };
    };

    // Initiate two concurrent calls.
    const [result1, result2] = await Promise.all([
      cache.memoize(api, 'concurrent', fetcher),
      cache.memoize(api, 'concurrent', fetcher),
    ]);

    assert.strictEqual(callCount, 1, 'fetcher should be called only once');
    assert.deepStrictEqual(result1, result2);
  });

  test('invalidate clears all cache for an API instance', async () => {
    const api = makeApi();
    let callCount = 0;

    const fetcher = async () => {
      callCount++;
      return { value: 'result' };
    };

    await cache.memoize(api, 'test', fetcher);
    assert.strictEqual(callCount, 1);

    cache.invalidate(api);

    await cache.memoize(api, 'test', fetcher);
    assert.strictEqual(callCount, 2, 'should refetch after invalidate');
  });

  test('invalidateProfile clears only the profile entry', async () => {
    const api = makeApi();
    let profileCalls = 0;
    let otherCalls = 0;

    const profileFetcher = async () => {
      profileCalls++;
      return { value: 'profile' };
    };

    const otherFetcher = async () => {
      otherCalls++;
      return { value: 'other' };
    };

    await cache.memoize(api, 'profile', profileFetcher);
    await cache.memoize(api, 'other', otherFetcher);

    cache.invalidateProfile(api);

    // Profile should refetch, other should still be cached.
    await cache.memoize(api, 'profile', profileFetcher);
    await cache.memoize(api, 'other', otherFetcher);

    assert.strictEqual(profileCalls, 2, 'profile should refetch');
    assert.strictEqual(otherCalls, 1, 'other should stay cached');
  });

  test('failures are not cached', async () => {
    const api = makeApi();
    let callCount = 0;

    const fetcher = async () => {
      callCount++;
      if (callCount === 1) throw new Error('first call fails');
      return { value: 'success' };
    };

    // First call fails.
    await assert.rejects(
      () => cache.memoize(api, 'fail', fetcher),
      /first call fails/,
    );
    assert.strictEqual(callCount, 1);

    // Second call should retry (not use cached error).
    const result = await cache.memoize(api, 'fail', fetcher);
    assert.strictEqual(callCount, 2);
    assert.deepStrictEqual(result, { value: 'success' });
  });

  test('separate API instances have separate caches', async () => {
    const api1 = makeApi();
    const api2 = makeApi();
    let callCount = 0;

    const fetcher = async () => {
      callCount++;
      return { value: 'result' };
    };

    await cache.memoize(api1, 'test', fetcher);
    await cache.memoize(api2, 'test', fetcher);

    // Each API instance should have its own cache entry, so fetcher is called twice.
    assert.strictEqual(callCount, 2);
  });
});
