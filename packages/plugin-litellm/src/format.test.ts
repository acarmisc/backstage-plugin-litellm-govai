import { describe, test } from 'node:test';
import assert from 'node:assert';
import { fmtUsd, fmtInt, formatCount, estimateTokensFromBudget, fmtLimits } from './format';

describe('fmtUsd', () => {
  test('uses 2 decimal places for amounts >= 0.01', () => {
    assert.strictEqual(fmtUsd(0), '$0.00');
    assert.strictEqual(fmtUsd(0.01), '$0.01');
    assert.strictEqual(fmtUsd(1), '$1.00');
    assert.strictEqual(fmtUsd(1.5), '$1.50');
    assert.strictEqual(fmtUsd(99.999), '$100.00');
  });

  test('renders non-zero values < 0.01 as <$0.01', () => {
    assert.strictEqual(fmtUsd(0.001), '<$0.01');
    assert.strictEqual(fmtUsd(0.005), '<$0.01');
    assert.strictEqual(fmtUsd(0.009), '<$0.01');
  });

  test('renders negative values < 0.01 as -<$0.01', () => {
    assert.strictEqual(fmtUsd(-0.001), '-<$0.01');
    assert.strictEqual(fmtUsd(-0.005), '-<$0.01');
  });

  test('treats null/undefined/NaN as 0', () => {
    assert.strictEqual(fmtUsd(null as unknown as number), '$0.00');
    assert.strictEqual(fmtUsd(undefined as unknown as number), '$0.00');
    assert.strictEqual(fmtUsd(NaN), '$0.00');
  });

  test('preserves negative sign for normal values', () => {
    assert.strictEqual(fmtUsd(-1), '-$1.00');
    assert.strictEqual(fmtUsd(-0.5), '-$0.50');
  });
});

describe('fmtInt', () => {
  test('formats zero', () => {
    assert.strictEqual(fmtInt(0), '0');
  });

  test('includes digit-group separators for large numbers', () => {
    const result = fmtInt(1234567);
    assert.ok(result.startsWith('1'), `expected to start with 1, got ${result}`);
    assert.ok(result.includes('234'), `expected to include 234, got ${result}`);
    assert.ok(result.endsWith('567'), `expected to end with 567, got ${result}`);
    assert.ok(result.length > 7, 'expected separators to add characters');
  });

  test('treats null/undefined as 0', () => {
    assert.strictEqual(fmtInt(null as unknown as number), '0');
    assert.strictEqual(fmtInt(undefined as unknown as number), '0');
  });
});

describe('formatCount', () => {
  test('formats a number with digit-group separators', () => {
    assert.strictEqual(formatCount(0), '0');
    assert.strictEqual(formatCount(5), '5');
    assert.strictEqual(formatCount(1000), '1,000');
  });

  test('returns "–" for null', () => {
    assert.strictEqual(formatCount(null), '–');
  });

  test('returns "–" for undefined', () => {
    assert.strictEqual(formatCount(undefined), '–');
  });
});

describe('estimateTokensFromBudget', () => {
  test('divides budget by per-token price', () => {
    assert.strictEqual(estimateTokensFromBudget(10, 0.00003), 333333);
  });

  test('rounds down to a whole token count', () => {
    assert.strictEqual(estimateTokensFromBudget(1, 0.003), 333);
  });

  test('returns null for missing or non-positive price', () => {
    assert.strictEqual(estimateTokensFromBudget(10), null);
    assert.strictEqual(estimateTokensFromBudget(10, 0), null);
    assert.strictEqual(estimateTokensFromBudget(10, -1), null);
  });

  test('returns null for missing or non-positive budget', () => {
    assert.strictEqual(estimateTokensFromBudget(0, 0.00003), null);
    assert.strictEqual(estimateTokensFromBudget(-5, 0.00003), null);
  });
});

describe('fmtLimits', () => {
  test('returns "Unlimited" when both limits are null/undefined', () => {
    assert.strictEqual(fmtLimits(null, null), 'Unlimited');
    assert.strictEqual(fmtLimits(undefined, undefined), 'Unlimited');
    assert.strictEqual(fmtLimits(null, undefined), 'Unlimited');
  });

  test('formats with "Unlimited" for missing limit', () => {
    assert.strictEqual(fmtLimits(1000, null), '1,000 / Unlimited');
    assert.strictEqual(fmtLimits(null, 100), 'Unlimited / 100');
    assert.strictEqual(fmtLimits(5000, undefined), '5,000 / Unlimited');
  });

  test('formats both limits when both are set', () => {
    assert.strictEqual(fmtLimits(10000, 1000), '10,000 / 1,000');
    assert.strictEqual(fmtLimits(5000, 500), '5,000 / 500');
  });

  test('includes digit-group separators', () => {
    assert.strictEqual(fmtLimits(1000000, 100000), '1,000,000 / 100,000');
  });
});
