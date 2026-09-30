import { describe, test } from 'node:test';
import assert from 'node:assert';
import { isModelAllowed, ALL_PROXY_MODELS } from './modelAccess';

describe('isModelAllowed', () => {
  const gpt = { model_name: 'gpt-4', access_groups: ['premium'] };

  test('empty or missing list is unrestricted', () => {
    assert.strictEqual(isModelAllowed(gpt, undefined), true);
    assert.strictEqual(isModelAllowed(gpt, []), true);
  });
  test('the all-proxy-models sentinel is unrestricted', () => {
    assert.strictEqual(isModelAllowed(gpt, [ALL_PROXY_MODELS]), true);
  });
  test('literal model names', () => {
    assert.strictEqual(isModelAllowed(gpt, ['gpt-4']), true);
    assert.strictEqual(isModelAllowed(gpt, ['claude']), false);
  });
  test('access-group names', () => {
    assert.strictEqual(isModelAllowed(gpt, ['premium']), true);
    assert.strictEqual(isModelAllowed(gpt, ['basic']), false);
    assert.strictEqual(isModelAllowed({ model_name: 'x' }, ['premium']), false);
  });
});
