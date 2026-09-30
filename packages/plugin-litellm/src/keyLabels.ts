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

/** Outcome of one permission check: granted, refused, or still loading (neither). */
export interface PermissionState {
  allowed: boolean;
  denied: boolean;
}

/**
 * Label and enabled-state of the row's block/unblock button. Blocking needs the
 * key-manage permission; unblocking needs the dedicated unblock permission (the
 * server does not let owners lift a block on their own say-so). "No permission"
 * wording only appears after a real denial, never while permissions load.
 */
export function blockButtonState(
  blocked: boolean | undefined,
  manage: PermissionState,
  unblock: PermissionState,
): { label: string; disabled: boolean } {
  if (blocked) {
    return {
      label: unblock.denied ? 'No permission to unblock keys' : 'Unblock key',
      disabled: !unblock.allowed,
    };
  }
  return {
    label: manage.denied
      ? 'No permission to block keys'
      : 'Block key \u2014 suspends without revoking',
    disabled: !manage.allowed,
  };
}
