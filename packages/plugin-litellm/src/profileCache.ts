/**
 * A per-API-instance promise cache with TTL and single-flight deduplication.
 * Used to memoize the profile hook's result and reduce redundant fetches.
 *
 * Each API instance gets its own cache entry; entries expire after a TTL.
 * Concurrent callers for the same key within the TTL share a single promise
 * and wait for its result rather than issuing parallel requests.
 *
 * Injectable clock for testing.
 */

import { LiteLlmApiInterface } from './api';

export interface Clock {
  now(): number;
}

export const systemClock: Clock = {
  now: () => Date.now(),
};

export interface ProfileCacheEntry {
  result: unknown;
  timestamp: number;
}

/**
 * Inflight tracker for single-flight deduplication.
 * Maps a key → a promise that resolves when the fetch completes.
 */
interface InflightEntry {
  promise: Promise<unknown>;
  resolveTime: number;
}

export class ProfileCache {
  private cache = new WeakMap<LiteLlmApiInterface, Record<string, ProfileCacheEntry>>();
  private inflight = new WeakMap<LiteLlmApiInterface, Record<string, InflightEntry>>();
  private ttlMs: number;
  private clock: Clock;

  constructor(ttlMs: number = 30_000, clock: Clock = systemClock) {
    this.ttlMs = ttlMs;
    this.clock = clock;
  }

  /**
   * Fetch or return a cached value. If a concurrent call with the same key
   * is in-flight, wait for it rather than issuing a parallel request.
   *
   * @param api The API instance (cache is scoped to it).
   * @param key A string key for the result (e.g., 'profile' or a team ID).
   * @param fetcher A thunk that returns the value to cache.
   * @returns The cached value (hit or miss) or the result of fetcher().
   */
  async memoize<T>(
    api: LiteLlmApiInterface,
    key: string,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    const now = this.clock.now();

    // Check if there's a valid cached entry.
    const cached = this.cache.get(api)?.[key];
    if (cached && now - cached.timestamp < this.ttlMs) {
      return cached.result as T;
    }

    // Check if there's an inflight promise we can reuse (but not if it failed).
    const inflight = this.inflight.get(api)?.[key];
    if (inflight && now - inflight.resolveTime < this.ttlMs) {
      return inflight.promise as Promise<T>;
    }

    // Fetch and cache, with single-flight protection.
    // Errors are not cached, so each retry fetches fresh.
    const promise = fetcher()
      .then(result => {
        // Cache the successful result.
        if (!this.cache.has(api)) this.cache.set(api, {});
        this.cache.get(api)![key] = { result, timestamp: this.clock.now() };
        return result;
      })
      .catch(err => {
        // Don't cache failures; remove the inflight entry so the next call retries.
        const inflightEntries = this.inflight.get(api);
        if (inflightEntries) {
          delete inflightEntries[key];
        }
        throw err;
      });

    // Track the inflight request.
    if (!this.inflight.has(api)) this.inflight.set(api, {});
    this.inflight.get(api)![key] = { promise, resolveTime: this.clock.now() };

    return promise as Promise<T>;
  }

  /**
   * Invalidate all cached entries for an API instance, including inflight requests.
   */
  invalidate(api: LiteLlmApiInterface): void {
    this.cache.delete(api);
    this.inflight.delete(api);
  }

  /**
   * Invalidate every profile entry (`profile`, `profile-userInfo`,
   * `profile-keys`, ...) and its in-flight promise, leaving unrelated keys alone.
   */
  invalidateProfile(api: LiteLlmApiInterface): void {
    const isProfileKey = (k: string) => k === 'profile' || k.startsWith('profile-');
    for (const store of [this.cache.get(api), this.inflight.get(api)]) {
      if (!store) continue;
      for (const k of Object.keys(store)) {
        if (isProfileKey(k)) delete store[k];
      }
    }
  }
}

// Singleton cache instance shared by all hooks using the same API ref.
export const profileCacheInstance = new ProfileCache();
