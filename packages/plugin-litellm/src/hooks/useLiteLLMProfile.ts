/**
 * Unified hook for fetching the user's LiteLLM profile: userInfo, teams, keys, models, and config.
 * Results are cached per API instance with a 30s TTL and single-flight deduplication.
 * Callers can invalidate the cache after mutations to ensure fresh data.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { liteLlmApiRef, LiteLlmApiInterface } from '../api';
import { UserInfo, TeamInfo, VirtualKey, ModelInfo, LiteLlmConfig } from '../types';
import { profileCacheInstance, ProfileCache } from '../profileCache';

export interface LiteLLMProfileResult {
  userInfo: UserInfo | null;
  teams: TeamInfo[];
  keys: VirtualKey[];
  models: ModelInfo[];
  config: LiteLlmConfig | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

interface ProfileData {
  userInfo: UserInfo | null;
  teams: TeamInfo[];
  keys: VirtualKey[];
  models: ModelInfo[];
  config: LiteLlmConfig | null;
}

/**
 * Fetch the complete user profile (userInfo, teams, keys, models, config).
 * Results are cached with a 30s TTL and single-flight deduplication per API instance.
 * Call the returned `retry()` after mutations to invalidate the cache.
 */
export function useLiteLLMProfile(cache: ProfileCache = profileCacheInstance): LiteLLMProfileResult {
  const api = useApi(liteLlmApiRef);
  const [data, setData] = useState<ProfileData>({
    userInfo: null,
    teams: [],
    keys: [],
    models: [],
    config: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const retryCounterRef = useRef(0);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [userInfo, teams, keys, models, config] = await Promise.all([
        cache.memoize(api, 'profile-userInfo', () => api.getUserInfo()),
        cache.memoize(api, 'profile-teams', () => api.getTeams()),
        cache.memoize(api, 'profile-keys', () => api.listKeys()),
        cache.memoize(api, 'profile-models', () => api.listModels()),
        cache.memoize(api, 'profile-config', () => api.getConfig()),
      ]);

      setData({ userInfo, teams, keys, models, config });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [api, cache]);

  useEffect(() => {
    fetchProfile();
  }, [api, fetchProfile]);

  const retry = useCallback(() => {
    cache.invalidateProfile(api);
    retryCounterRef.current++;
    fetchProfile();
  }, [api, cache, fetchProfile]);

  return {
    ...data,
    loading,
    error,
    retry,
  };
}

/**
 * Invalidate the profile cache for an API instance after a mutation
 * (e.g., after creating/updating/deleting a key or team).
 *
 * @param api The API instance to invalidate.
 * @param cache The cache instance (defaults to the singleton).
 */
export function invalidateLiteLLMProfile(
  api: LiteLlmApiInterface,
  cache: ProfileCache = profileCacheInstance,
): void {
  cache.invalidateProfile(api);
}
