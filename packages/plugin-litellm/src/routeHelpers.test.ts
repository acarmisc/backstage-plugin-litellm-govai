import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildKeysLink } from './routeHelpers';

describe('routeHelpers', () => {
  describe('buildKeysLink', () => {
    it('builds a keys link with the given base URL', () => {
      const result = buildKeysLink('/litellm');
      assert.strictEqual(result, '/litellm?tab=keys');
    });

    it('returns undefined when baseUrl is undefined', () => {
      const result = buildKeysLink(undefined);
      assert.strictEqual(result, undefined);
    });

    it('returns undefined when baseUrl is empty string', () => {
      const result = buildKeysLink('');
      assert.strictEqual(result, '?tab=keys');
    });
  });
});
