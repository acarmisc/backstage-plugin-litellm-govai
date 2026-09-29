/**
 * Widget state machine for loading, error, and ready states.
 *
 * Discriminated union that represents the overall state of a widget:
 * - 'loading': profile or usage data is being fetched
 * - 'unprovisioned': user has no LiteLLM account (provisioning error)
 * - 'error': a data fetch failed (non-provisioning error)
 * - 'ready': data is available; usageUnavailable indicates failed usage fetch
 */

import { ApiError } from './api';

export const USAGE_UNAVAILABLE_MSG = 'Usage unavailable';
export const UNPROVISIONED_MSG = 'LiteLLM account not set up. Ask your admin.';

/**
 * Detects whether an ApiError represents a provisioning error.
 * The backend returns a 404 with body { error: 'User not found in LiteLLM' }
 * when the user hasn't been provisioned.
 */
export function isUnprovisionedError(error: unknown): boolean {
  if (!(error instanceof ApiError)) {
    return false;
  }
  if (error.status !== 404) {
    return false;
  }
  const body = error.body as any;
  if (!body || typeof body !== 'object') {
    return false;
  }
  return body.error === 'User not found in LiteLLM';
}

export type WidgetViewState =
  | { kind: 'loading' }
  | { kind: 'unprovisioned' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; usageUnavailable: boolean };

export interface WidgetStateParams {
  /** True if profile data is currently loading */
  loading: boolean;
  /** Error from profile fetch (getUserInfo). null if no error. */
  error: unknown;
  /** User info object; null if not loaded or unprovisioned */
  userInfo: unknown;
  /** Error from usage fetch. null if no error. */
  usageError: unknown;
  /** Number of keys; optional. Used to determine if the user has any keys. */
  hasKeys?: boolean;
}

/**
 * Determines the overall widget view state based on loading and error conditions.
 *
 * Priority:
 * 1. If loading, return 'loading'
 * 2. If profile error is unprovisioned, return 'unprovisioned'
 * 3. If profile error (any other), return 'error'
 * 4. Otherwise, return 'ready' with usageUnavailable flag based on usageError
 */
export function widgetViewState({
  loading,
  error,
  userInfo,
  usageError,
  hasKeys,
}: WidgetStateParams): WidgetViewState {
  if (loading) {
    return { kind: 'loading' };
  }

  if (error) {
    if (isUnprovisionedError(error)) {
      return { kind: 'unprovisioned' };
    }
    return { kind: 'error', message: USAGE_UNAVAILABLE_MSG };
  }

  return {
    kind: 'ready',
    usageUnavailable: usageError != null,
  };
}
