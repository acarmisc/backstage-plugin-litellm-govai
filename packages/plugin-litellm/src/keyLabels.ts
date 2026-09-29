import type { VirtualKey } from './types';

/**
 * Returns a display label for a key: alias if present, otherwise the masked key.
 * Handles missing alias and odd/short masked strings gracefully.
 */
export function keyDisplayLabel(key: VirtualKey): string {
  if (key.key_alias) {
    return key.key_alias;
  }
  return key.key || '—';
}

/**
 * Extracts the last 4 characters from a key's masked value.
 * Returns empty string if the key is shorter than 4 chars.
 */
export function keyLast4(key: VirtualKey): string {
  if (!key.key || key.key.length < 4) {
    return '';
  }
  return key.key.slice(-4);
}

/**
 * Generates the confirmation copy for pruning expired keys.
 * Handles singular and plural correctly.
 */
export function pruneCopy(n: number): string {
  if (n === 1) {
    return 'Remove 1 expired key from the list. It already doesn\'t work.';
  }
  return `Remove ${n} expired keys from the list. They already don't work.`;
}
