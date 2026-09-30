import { describe, test } from 'node:test';
import assert from 'node:assert';
import { changedEditFields, isModelAllowedByTeam } from './keyFormHelpers';
import type { UpdateKeyRequest } from '../types';

const original: UpdateKeyRequest = {
  key_alias: 'my-key',
  models: ['gpt-4'],
  max_budget: 500, // legacy value above today's server ceiling
  tpm_limit: 900000,
  rpm_limit: undefined,
};

describe('changedEditFields', () => {
  test('nothing changed sends nothing', () => {
    assert.deepStrictEqual(changedEditFields(original, { ...original }, false), {});
  });

  test('a rename does not resend the untouched legacy budget/limits', () => {
    assert.deepStrictEqual(
      changedEditFields(original, { ...original, key_alias: 'renamed' }, false),
      { key_alias: 'renamed' },
    );
  });

  test('changed models and budget are sent', () => {
    assert.deepStrictEqual(
      changedEditFields(original, { ...original, models: ['gpt-4', 'o1'], max_budget: 50 }, false),
      { models: ['gpt-4', 'o1'], max_budget: 50 },
    );
  });

  test('ticking Unlimited sends max_budget null; already-unlimited stays untouched', () => {
    assert.deepStrictEqual(changedEditFields(original, { ...original }, true), { max_budget: null });
    const unlimited = { ...original, max_budget: undefined };
    assert.deepStrictEqual(changedEditFields(unlimited, { ...unlimited }, true), {});
  });

  test('clearing models is a change', () => {
    assert.deepStrictEqual(changedEditFields(original, { ...original, models: [] }, false), { models: [] });
  });
});

describe('isModelAllowedByTeam (shared rules)', () => {
  test('sentinel, literal and access-group entries', () => {
    const m = { model_name: 'gpt-4', access_groups: ['premium'] } as any;
    assert.strictEqual(isModelAllowedByTeam(m, ['all-proxy-models']), true);
    assert.strictEqual(isModelAllowedByTeam(m, ['premium']), true);
    assert.strictEqual(isModelAllowedByTeam(m, ['claude']), false);
    assert.strictEqual(isModelAllowedByTeam(m, undefined), true);
  });
});
