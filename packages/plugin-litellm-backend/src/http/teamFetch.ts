import { LiteLLMUpstreamError } from '../client';

export const teamCreateInFlight = new Map<string, Promise<unknown>>();

/** Backoff schedule for `withTeamFetchRetry` — 3 retries over ~1.3s total. */
const TEAM_FETCH_RETRY_DELAYS_MS = [100, 300, 900];

/**
 * Only 5xx (and network/timeout) failures are treated as transient — a 4xx
 * like "team not found" or "forbidden" is a deterministic answer from the
 * upstream and retrying it would just add latency for the same result.
 */
function isRetryableTeamFetchError(err: unknown): boolean {
  if (err instanceof LiteLLMUpstreamError) {
    return err.status >= 500;
  }
  return true;
}

/**
 * Retries a LiteLLM team-info fetch with the given backoff schedule.
 *
 * LiteLLM proxies are commonly run behind multiple replicas; a request can
 * land on a replica that hasn't yet caught up with a very recent write
 * (team create/update, membership change), or on one that is transiently
 * unhealthy. Both surface as a failed `getTeamInfo` call that would
 * otherwise be swallowed (e.g. GET /teams silently drops the team from the
 * response) or bubble up as a spurious 500/404 right after a write this
 * same request just made. A short retry smooths over that window without
 * masking a genuine, persistent failure.
 */
export async function withTeamFetchRetry<T>(
  fn: () => Promise<T>,
  delaysMs: number[] = TEAM_FETCH_RETRY_DELAYS_MS,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= delaysMs.length || !isRetryableTeamFetchError(err)) {
        throw err;
      }
      await new Promise(resolve => setTimeout(resolve, delaysMs[attempt]));
    }
  }
}
