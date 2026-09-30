import { describe, test } from 'node:test';
import assert from 'node:assert';
import { keyDisplayLabel, keyLast4, pruneCopy, blockButtonState } from './keyLabels';
import type { VirtualKey } from './types';

describe('keyLabels', () => {
  describe('keyDisplayLabel', () => {
    test('returns alias when present', () => {
      const key: VirtualKey = {
        key: 'sk-1234567890abcdef',
        key_alias: 'my-key',
        created_at: '2026-01-01',
        spend: 0,
      };
      assert.equal(keyDisplayLabel(key), 'my-key');
    });

    test('returns masked key when alias is missing', () => {
      const key: VirtualKey = {
        key: 'sk-1234567890abcdef',
        created_at: '2026-01-01',
        spend: 0,
      };
      assert.equal(keyDisplayLabel(key), 'sk-1234567890abcdef');
    });

    test('returns masked key when alias is empty string', () => {
      const key: VirtualKey = {
        key: 'sk-1234567890abcdef',
        key_alias: '',
        created_at: '2026-01-01',
        spend: 0,
      };
      assert.equal(keyDisplayLabel(key), 'sk-1234567890abcdef');
    });

    test('returns dash when key is missing and no alias', () => {
      const key: VirtualKey = {
        key: '',
        created_at: '2026-01-01',
        spend: 0,
      };
      assert.equal(keyDisplayLabel(key), '—');
    });
  });

  describe('keyLast4', () => {
    test('returns last 4 characters of key', () => {
      const key: VirtualKey = {
        key: 'sk-1234567890abcdef',
        created_at: '2026-01-01',
        spend: 0,
      };
      assert.equal(keyLast4(key), 'cdef');
    });

    test('returns empty string when key is shorter than 4 chars', () => {
      const key: VirtualKey = {
        key: 'abc',
        created_at: '2026-01-01',
        spend: 0,
      };
      assert.equal(keyLast4(key), '');
    });

    test('returns empty string when key is exactly 4 chars', () => {
      const key: VirtualKey = {
        key: 'abcd',
        created_at: '2026-01-01',
        spend: 0,
      };
      assert.equal(keyLast4(key), 'abcd');
    });

    test('returns empty string when key is missing', () => {
      const key: VirtualKey = {
        key: '',
        created_at: '2026-01-01',
        spend: 0,
      };
      assert.equal(keyLast4(key), '');
    });

    test('handles odd masked strings like sk-...abcd', () => {
      const key: VirtualKey = {
        key: 'sk-...wxyz',
        created_at: '2026-01-01',
        spend: 0,
      };
      assert.equal(keyLast4(key), 'wxyz');
    });
  });

  describe('pruneCopy', () => {
    test('returns singular text for n=1', () => {
      assert.equal(pruneCopy(1), 'Remove 1 expired key from the list. It already doesn\'t work.');
    });

    test('returns plural text for n=2', () => {
      assert.equal(pruneCopy(2), 'Remove 2 expired keys from the list. They already don\'t work.');
    });

    test('returns plural text for n>2', () => {
      assert.equal(pruneCopy(5), 'Remove 5 expired keys from the list. They already don\'t work.');
    });

    test('handles n=0', () => {
      assert.equal(pruneCopy(0), 'Remove 0 expired keys from the list. They already don\'t work.');
    });
  });
});


describe('blockButtonState', () => {
  const yes = { allowed: true, denied: false };
  const no = { allowed: false, denied: true };
  const loading = { allowed: false, denied: false };

  test('blocking follows the manage permission', () => {
    assert.deepStrictEqual(blockButtonState(false, yes, no), { label: 'Block key — suspends without revoking', disabled: false });
    assert.deepStrictEqual(blockButtonState(false, no, yes), { label: 'No permission to block keys', disabled: true });
  });

  test('unblocking follows the unblock permission, not manage', () => {
    assert.deepStrictEqual(blockButtonState(true, yes, no), { label: 'No permission to unblock keys', disabled: true });
    assert.deepStrictEqual(blockButtonState(true, no, yes), { label: 'Unblock key', disabled: false });
  });

  test('while permissions load the button is disabled but never claims "no permission"', () => {
    assert.deepStrictEqual(blockButtonState(false, loading, loading), { label: 'Block key — suspends without revoking', disabled: true });
    assert.deepStrictEqual(blockButtonState(true, loading, loading), { label: 'Unblock key', disabled: true });
  });
});
