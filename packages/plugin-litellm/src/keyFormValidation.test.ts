import { describe, test } from 'node:test';
import assert from 'node:assert';
import { validateKeyForm, firstInvalidField, expiryPreview, priciestInputPrice } from './keyFormValidation';

describe('validateKeyForm', () => {
  test('requires alias', () => {
    const errors = validateKeyForm({ alias: '' }, { isCreate: true });
    assert.strictEqual(errors.alias, 'Alias is required');
  });

  test('passes with valid alias', () => {
    const errors = validateKeyForm({ alias: 'test-key' }, { isCreate: true });
    assert.strictEqual(errors.alias, undefined);
  });

  test('a duplicate alias is a warning in the UI, never a blocking error', () => {
    const errors = validateKeyForm({ alias: 'existing', max_budget: 5 }, { isCreate: true, teamRequired: false });
    assert.strictEqual(errors.alias, undefined);
  });

  test('requires team when teamRequired is true', () => {
    const errors = validateKeyForm({ alias: 'test', team_id: undefined }, { isCreate: true, teamRequired: true });
    assert.strictEqual(errors.team, 'Team is required');
  });

  test('team is optional when teamRequired is false', () => {
    const errors = validateKeyForm({ alias: 'test', team_id: undefined }, { isCreate: true, teamRequired: false });
    assert.strictEqual(errors.team, undefined);
  });

  test('requires budget when unlimited is not ticked', () => {
    const errors = validateKeyForm({ alias: 'test', max_budget: undefined }, { isCreate: true, unlimitedBudget: false });
    assert.ok(errors.budget);
  });

  test('allows an empty budget only when unlimited is ticked', () => {
    const errors = validateKeyForm({ alias: 'test', max_budget: null }, { isCreate: true, unlimitedBudget: true });
    assert.strictEqual(errors.budget, undefined);
  });

  test('rejects zero or negative budget', () => {
    const errors = validateKeyForm({ alias: 'test', max_budget: 0 }, { isCreate: true, unlimitedBudget: false });
    assert.ok(errors.budget);
    const errors2 = validateKeyForm({ alias: 'test', max_budget: -5 }, { isCreate: true, unlimitedBudget: false });
    assert.ok(errors2.budget);
  });

  test('accepts positive budget', () => {
    const errors = validateKeyForm({ alias: 'test', max_budget: 100 }, { isCreate: true, unlimitedBudget: false });
    assert.strictEqual(errors.budget, undefined);
  });

  test('edit mode does not validate team', () => {
    const errors = validateKeyForm({ key_alias: 'test' }, { isCreate: false, teamRequired: true });
    assert.strictEqual(errors.team, undefined);
  });
});

describe('firstInvalidField', () => {
  test('returns null when no errors', () => {
    const errors = {};
    const field = firstInvalidField(errors, true);
    assert.strictEqual(field, null);
  });

  test('returns first field in create mode order', () => {
    const errors = { alias: 'x', team: 'y', budget: 'z' };
    const field = firstInvalidField(errors, true);
    assert.strictEqual(field, 'team');
  });

  test('returns first field in edit mode order (no team)', () => {
    const errors = { alias: 'x', team: 'y', budget: 'z' };
    const field = firstInvalidField(errors, false);
    assert.strictEqual(field, 'alias');
  });

  test('returns budget when alias and team are ok', () => {
    const errors = { budget: 'z' };
    const field = firstInvalidField(errors, true);
    assert.strictEqual(field, 'budget');
  });
});

describe('expiryPreview', () => {
  test('adds days', () => {
    const now = new Date('2026-09-29');
    const result = expiryPreview('1d', now);
    assert.strictEqual(result, 'Expires Sep 30, 2026');
  });

  test('adds weeks', () => {
    const now = new Date('2026-09-29');
    const result = expiryPreview('1w', now);
    assert.strictEqual(result, 'Expires Oct 6, 2026');
  });

  test('adds months and handles rollover', () => {
    const now = new Date('2026-09-29');
    const result = expiryPreview('1m', now);
    assert.strictEqual(result, 'Expires Oct 29, 2026');
  });

  test('adds months with year rollover', () => {
    const now = new Date('2026-11-29');
    const result = expiryPreview('2m', now);
    assert.strictEqual(result, 'Expires Jan 29, 2027');
  });

  test('adds years', () => {
    const now = new Date('2026-09-29');
    const result = expiryPreview('1y', now);
    assert.strictEqual(result, 'Expires Sep 29, 2027');
  });

  test('returns null for invalid format', () => {
    const result = expiryPreview('30x', new Date());
    assert.strictEqual(result, null);
  });

  test('returns null for undefined duration', () => {
    const result = expiryPreview(undefined, new Date());
    assert.strictEqual(result, null);
  });

  test('handles 30d standard duration', () => {
    const now = new Date('2026-09-29');
    const result = expiryPreview('30d', now);
    assert.strictEqual(result, 'Expires Oct 29, 2026');
  });

  test('handles 90d duration', () => {
    const now = new Date('2026-09-29');
    const result = expiryPreview('90d', now);
    assert.ok(result?.includes('Expires'));
    assert.ok(result?.includes('2026'));
  });
});

describe('priciestInputPrice', () => {
  test('returns the max input cost', () => {
    const models = [
      { input_cost_per_token: 0.00001 },
      { input_cost_per_token: 0.00003 },
      { input_cost_per_token: 0.00002 },
    ];
    const price = priciestInputPrice(models);
    assert.strictEqual(price, 0.00003);
  });

  test('ignores zero and missing costs', () => {
    const models = [
      { input_cost_per_token: undefined },
      { input_cost_per_token: 0 },
      { input_cost_per_token: 0.00001 },
    ];
    const price = priciestInputPrice(models);
    assert.strictEqual(price, 0.00001);
  });

  test('returns null when no valid costs', () => {
    const models = [{ input_cost_per_token: undefined }, { input_cost_per_token: 0 }];
    const price = priciestInputPrice(models);
    assert.strictEqual(price, null);
  });

  test('returns null for empty array', () => {
    const price = priciestInputPrice([]);
    assert.strictEqual(price, null);
  });
});
