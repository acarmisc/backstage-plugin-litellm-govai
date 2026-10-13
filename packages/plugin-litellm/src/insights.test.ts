import { describe, test } from 'node:test';
import assert from 'node:assert';
import { summarizeUsage, scorePractices, modelOpportunities } from './insights';
import type { UsageMetrics } from './types';

const breakdown = (over: Record<string, number | object> = {}) => ({
  total_spend: 0, total_tokens: 0, prompt_tokens: 0, completion_tokens: 0,
  api_requests: 0, successful_requests: 0, failed_requests: 0, ...over,
});

const usageFixture = (): UsageMetrics => ({
  total_spend: 100, total_tokens: 1_000_000, prompt_tokens: 800_000,
  completion_tokens: 200_000, api_requests: 1000, successful_requests: 900,
  failed_requests: 100,
  usage_by_model: {
    'cheap': { ...breakdown({ total_spend: 10, total_tokens: 500_000, prompt_tokens: 400_000, completion_tokens: 100_000, api_requests: 500, successful_requests: 495, failed_requests: 5 }) },
    'pricey': { ...breakdown({ total_spend: 90, total_tokens: 500_000, prompt_tokens: 450_000, completion_tokens: 50_000, api_requests: 500, successful_requests: 405, failed_requests: 95 }) },
  },
  usage_by_key: {},
  daily_usage: Array.from({ length: 10 }, (_, i) => ({
    date: `2026-10-${String(i + 1).padStart(2, '0')}`, spend: 10,
    total_tokens: 100_000, prompt_tokens: 80_000, completion_tokens: 20_000,
    api_requests: 100, successful_requests: 90, failed_requests: 10,
  })),
  daily_by_model: [],
} as unknown as UsageMetrics);

describe('summarizeUsage', () => {
  test('null usage yields nulls and zeros', () => {
    const s = summarizeUsage(null);
    assert.strictEqual(s.costPer1kTokens, null);
    assert.strictEqual(s.costPerRequest, null);
    assert.strictEqual(s.successRate, null);
    assert.strictEqual(s.retryWasteUsd, 0);
    assert.strictEqual(s.projectedMonthSpend, null);
    assert.deepStrictEqual(modelOpportunities(null), []);
  });

  test('retry waste math: spend share of failed requests', () => {
    const s = summarizeUsage(usageFixture());
    assert.strictEqual(s.retryWasteShare, 0.1);
    assert.strictEqual(s.retryWasteUsd, 10);
    assert.strictEqual(s.successRate, 0.9);
    assert.strictEqual(s.costPerRequest, 0.1);
    assert.strictEqual(s.costPer1kTokens, 0.1);
    assert.strictEqual(s.projectedMonthSpend, 300);
  });

  test('premium share splits cheap vs premium models', () => {
    const models = [
      { model_name: 'cheap', input_cost_per_token: 0.0000005, output_cost_per_token: 0.0000005 },
      { model_name: 'pricey', input_cost_per_token: 0.00001, output_cost_per_token: 0.00003 },
    ] as any;
    const s = summarizeUsage(usageFixture(), models, 0.01);
    assert.strictEqual(s.premiumSpend, 90);
    assert.strictEqual(s.premiumShare, 0.9);
    assert.strictEqual(s.topModelConcentration, 0.9);
  });
});

describe('modelOpportunities', () => {
  test('flags downgrade candidate and failure outlier', () => {
    const models = [
      { model_name: 'cheap', input_cost_per_token: 0.0000005, output_cost_per_token: 0.0000005 },
      { model_name: 'pricey', input_cost_per_token: 0.00001, output_cost_per_token: 0.00003 },
    ] as any;
    const opps = modelOpportunities(usageFixture(), models, 0.01);
    const pricey = opps.find(o => o.model === 'pricey')!;
    // 19% fail vs 10% overall is not >2x, so downgrade wins (10% output, 90% spend)
    assert.strictEqual(pricey.flag, 'downgrade-candidate');
    assert.ok(pricey.avgCostPerRequest > 0);
  });

  test('flags failure outlier when rate exceeds 2x overall', () => {
    const u = usageFixture();
    (u.usage_by_model as any)['flaky'] = breakdown({
      total_spend: 1, total_tokens: 10_000, prompt_tokens: 5_000, completion_tokens: 5_000,
      api_requests: 20, successful_requests: 10, failed_requests: 10,
    });
    const opps = modelOpportunities(u, [], 1000);
    assert.strictEqual(opps.find(o => o.model === 'flaky')!.flag, 'failure-outlier');
    assert.strictEqual(opps.find(o => o.model === 'cheap')!.flag, 'ok');
  });
});

describe('scorePractices', () => {
  test('total stays within 0-100 bounds', () => {
    const good = scorePractices(
      { retryWasteShare: 0, premiumShare: 0, topModelConcentration: 0.1 } as any,
      { idleKeys: 0, uncappedKeys: 0, totalKeys: 5 },
    );
    assert.strictEqual(good.total, 100);
    const bad = scorePractices(
      { retryWasteShare: 0.5, premiumShare: 0.95, topModelConcentration: 0.95 } as any,
      { idleKeys: 5, uncappedKeys: 5, totalKeys: 10 },
    );
    assert.strictEqual(bad.total, 0);
    for (const s of [good, bad]) {
      assert.ok(s.total >= 0 && s.total <= 100);
      assert.strictEqual(s.checks.reduce((n: number, c: { maxPoints: number }) => n + c.maxPoints, 0), 100);
    }
  });
});
