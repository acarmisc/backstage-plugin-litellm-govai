/**
 * Pure filtering functions for key lists.
 */

import { VirtualKey } from './types';
import { expiryStatus } from './api';

export type KeyFilterType = 'expired' | 'expiring' | undefined;

/**
 * Filter keys by expiry status.
 * @param keys List of keys to filter
 * @param filter Filter type: 'expired', 'expiring', or undefined (no filter)
 * @returns Filtered list of keys
 */
export function filterKeysByStatus(keys: VirtualKey[], filter: KeyFilterType): VirtualKey[] {
  if (!filter) return keys;

  return keys.filter(key => {
    const status = expiryStatus(key.expires_at);
    if (filter === 'expired') return status === 'expired';
    if (filter === 'expiring') return status === 'soon';
    return true;
  });
}

/**
 * True when the key's alias starts with one of the configured service-key
 * prefixes (case-insensitive). Keys without an alias never match.
 */
export function isServiceKey(key: VirtualKey, prefixes: string[] | undefined): boolean {
  if (!prefixes?.length) return false;
  const alias = (key.key_alias ?? '').toLowerCase();
  if (!alias) return false;
  return prefixes.some(p => p.trim() !== '' && alias.startsWith(p.trim().toLowerCase()));
}

/** Drops service keys (see {@link isServiceKey}); a no-op without prefixes. */
export function filterServiceKeys(keys: VirtualKey[], prefixes: string[] | undefined): VirtualKey[] {
  if (!prefixes?.length) return keys;
  return keys.filter(k => !isServiceKey(k, prefixes));
}
