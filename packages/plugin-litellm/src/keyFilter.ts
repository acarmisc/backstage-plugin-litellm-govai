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
