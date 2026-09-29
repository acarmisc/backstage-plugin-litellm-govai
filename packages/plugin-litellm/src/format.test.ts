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

import { modelsWithUsage } from './format';

describe('modelsWithUsage', () => {
  const mockModels = [
    { model_name: 'gpt-4' },
    { model_name: 'gpt-3.5-turbo' },
    { model_name: 'claude-3-opus' },
    { model_name: 'unused-model' },
  ];

  test('returns all models when usage is null', () => {
    const result = modelsWithUsage(null, mockModels);
    assert.deepStrictEqual(result, ['gpt-4', 'gpt-3.5-turbo', 'claude-3-opus', 'unused-model']);
  });

  test('returns all models when usage_by_model is undefined', () => {
    const result = modelsWithUsage({}, mockModels);
    assert.deepStrictEqual(result, ['gpt-4', 'gpt-3.5-turbo', 'claude-3-opus', 'unused-model']);
  });

  test('filters to only models with usage', () => {
    const usage = {
      usage_by_model: {
        'gpt-4': {
          total_spend: 10,
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          api_requests: 5,
          successful_requests: 5,
          failed_requests: 0,
        },
        'claude-3-opus': {
          total_spend: 5,
          prompt_tokens: 50,
          completion_tokens: 25,
          total_tokens: 75,
          api_requests: 3,
          successful_requests: 3,
          failed_requests: 0,
        },
      },
    };
    const result = modelsWithUsage(usage, mockModels);
    assert.deepStrictEqual(result, ['gpt-4', 'claude-3-opus']);
  });

  test('preserves order from the models list', () => {
    const usage = {
      usage_by_model: {
        'gpt-3.5-turbo': {
          total_spend: 1,
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
          api_requests: 1,
          successful_requests: 1,
          failed_requests: 0,
        },
        'gpt-4': {
          total_spend: 20,
          prompt_tokens: 200,
          completion_tokens: 100,
          total_tokens: 300,
          api_requests: 10,
          successful_requests: 10,
          failed_requests: 0,
        },
      },
    };
    const result = modelsWithUsage(usage, mockModels);
    // Should be in the order they appear in mockModels, not usage_by_model
    assert.deepStrictEqual(result, ['gpt-4', 'gpt-3.5-turbo']);
  });
});
