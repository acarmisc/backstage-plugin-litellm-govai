import { UserInfo } from '../types';
import { LiteLLMClient } from '../client';

/**
 * Clock abstraction for testing. Allows tests to fake time without real delays.
 */
export interface Clock {
  now(): number;
}

/**
 * Default system clock using Date.now().
 */
const SystemClock: Clock = {
  now: () => Date.now(),
};

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Simple LRU cache with per-entry TTL.
 * - Max ~500 entries; LRU eviction when full.
 * - Each entry has its own expiry time.
 * - Tracks pending promises for single-flight deduplication.
 */
export class UserInfoCache {
  private static readonly MAX_ENTRIES = 500;
  private cache = new Map<string, CacheEntry<UserInfo>>();
  private pending = new Map<string, Promise<UserInfo | null>>();
  private clock: Clock;
  private ttlMs: number;

  constructor(ttlMs: number = 10_000, clock: Clock = SystemClock) {
    this.ttlMs = ttlMs;
    this.clock = clock;
  }

  /**
   * Get a cached value, or null if not found or expired.
   */
  get(userId: string): UserInfo | null {
    const entry = this.cache.get(userId);
    if (!entry) return null;

    if (this.clock.now() >= entry.expiresAt) {
      // Expired; remove and return null
      this.cache.delete(userId);
      return null;
    }

    return entry.value;
  }

  /**
   * Set a cache entry (does not expire).
   */
  set(userId: string, value: UserInfo): void {
    // Evict LRU entry if at capacity
    if (this.cache.size >= UserInfoCache.MAX_ENTRIES && !this.cache.has(userId)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    const expiresAt = this.clock.now() + this.ttlMs;
    this.cache.set(userId, { value, expiresAt });
  }

  /**
   * Invalidate a single user's cache entry.
   */
  invalidate(userId: string): void {
    this.cache.delete(userId);
  }

  /**
   * Clear all cache entries and pending promises.
   */
  clear(): void {
    this.cache.clear();
    this.pending.clear();
  }

  /**
   * Internal: track a pending promise for single-flight deduplication.
   * Returns the promise, which is stored and shared across concurrent requests.
   */
  private getPending(
    userId: string,
    loader: () => Promise<UserInfo | null>,
  ): Promise<UserInfo | null> {
    const existing = this.pending.get(userId);
    if (existing) return existing;

    const promise = loader().finally(() => {
      // Clean up pending once resolved or rejected
      this.pending.delete(userId);
    });

    this.pending.set(userId, promise);
    return promise;
  }

  /**
   * Load a value through the cache with single-flight deduplication.
   * If the value is already cached and not expired, return it.
   * If another request is loading the same userId, wait for that promise.
   * Otherwise, call the loader and cache the result (unless null or error).
   *
   * Errors and null results are NOT cached.
   */
  async load(
    userId: string,
    loader: () => Promise<UserInfo | null>,
  ): Promise<UserInfo | null> {
    // Check cache first
    const cached = this.get(userId);
    if (cached) return cached;

    // Use single-flight for concurrent requests
    const result = await this.getPending(userId, loader);

    // Cache only non-null success results
    if (result) {
      this.set(userId, result);
    }

    return result;
  }
}

/**
 * Wraps a LiteLLMClient to inject getUserInfo caching and automatic cache
 * invalidation on mutations.
 *
 * Returns a Proxy that:
 * - Routes getUserInfo(userId) through the cache
 * - Invalidates the cache (clear all) after any method matching the mutation pattern
 * - Delegates all other methods to the wrapped client unchanged
 */
export function withUserInfoCache(
  client: LiteLLMClient,
  options?: {
    ttlMs?: number;
    clock?: Clock;
  },
): LiteLLMClient {
  const cache = new UserInfoCache(options?.ttlMs ?? 10_000, options?.clock);

  // Methods whose names match this pattern indicate a mutation that should
  // invalidate the cache to ensure consistency.
  const isMutatingMethod = /^(generate|update|delete|block|unblock|reset|create|add|remove|set|regenerate|provision|teamMember)/i;

  return new Proxy(client, {
    get(target: any, prop: string | symbol) {
      // Wrap getUserInfo through the cache
      if (prop === 'getUserInfo') {
        return async (userId?: string): Promise<any> => {
          if (!userId) {
            // No userId => call upstream directly (shouldn't happen in normal flow)
            return target.getUserInfo(userId);
          }
          return cache.load(userId, () => target.getUserInfo(userId));
        };
      }

      // Get the method from the target
      const method = target[prop];
      if (typeof method !== 'function') {
        return method;
      }

      // If the method name matches the mutation pattern, wrap it to invalidate cache
      if (isMutatingMethod.test(String(prop))) {
        return async (...args: any[]): Promise<any> => {
          const result = await method.apply(target, args);
          // Invalidate entire cache after any mutation (simple and safe)
          cache.clear();
          return result;
        };
      }

      // For other methods, bind and return as-is
      return method.bind(target);
    },
  });
}
