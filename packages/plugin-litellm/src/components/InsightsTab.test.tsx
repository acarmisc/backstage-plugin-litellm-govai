import '../testing/setupDom';
import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert';
import { ComponentProps } from 'react';
import { render, cleanup, screen } from '@testing-library/react';
import { InsightsTab } from './InsightsTab';
import type { UsageMetrics, VirtualKey, ModelInfo } from '../types';
import type { LiteLlmApiInterface } from '../api';

afterEach(() => cleanup());

const breakdown = (over: Record<string, number> = {}) => ({
  total_spend: 0, total_tokens: 0, prompt_tokens: 0, completion_tokens: 0,
  api_requests: 0, successful_requests: 0, failed_requests: 0, ...over,
});

const usageFixture = (): UsageMetrics => ({
  total_spend: 100, total_tokens: 1_000_000, prompt_tokens: 800_000,
  completion_tokens: 200_000, api_requests: 500, successful_requests: 450,
  failed_requests: 50,
  usage_by_model: {
    // Listed first but healthy — the flagged row must sort above it.
    'aaa-ok': { ...breakdown({ total_spend: 10, total_tokens: 500_000, prompt_tokens: 250_000, completion_tokens: 250_000, api_requests: 250, successful_requests: 248, failed_requests: 2 }) },
    'zzz-pricey': { ...breakdown({ total_spend: 90, total_tokens: 500_000, prompt_tokens: 450_000, completion_tokens: 50_000, api_requests: 250, successful_requests: 202, failed_requests: 48 }) },
  },
  usage_by_key: {},
  daily_usage: [],
  daily_by_model: [],
} as unknown as UsageMetrics);

const priceyModels = [
  { model_name: 'aaa-ok', input_cost_per_token: 0.0000005, output_cost_per_token: 0.0000005 },
  { model_name: 'zzz-pricey', input_cost_per_token: 0.00001, output_cost_per_token: 0.00003 },
] as unknown as ModelInfo[];

const keysFixture = (): VirtualKey[] => ([
  { key: 'sk-...1', token: 'h1', spend: 5, max_budget: 100 } as VirtualKey,
  { key: 'sk-...2', token: 'h2', spend: 0 } as unknown as VirtualKey,
]);

const mockApi = (over: Partial<LiteLlmApiInterface> = {}) =>
  ({
    getSpendLogs: async () => ({ data: [], total: 0, page: 1, pageSize: 25, truncated: false }),
    ...over,
  } as unknown as LiteLlmApiInterface);

type Props = ComponentProps<typeof InsightsTab>;

const renderTab = (overrides: Partial<Props> = {}) => {
  const props: Props = {
    api: mockApi(),
    usage: usageFixture(),
    models: priceyModels,
    keys: keysFixture(),
    dateRange: { start: new Date(2026, 9, 1), end: new Date(2026, 9, 7) },
    loading: false,
    ...overrides,
  };
  return render(<InsightsTab {...props} />);
};

describe('InsightsTab', () => {
  test('renders KPIs derived from usage', async () => {
    renderTab();
    // cost/1k = 100/1M*1000, cost/req = 100/500, out:in = 200k/800k
    assert.ok(await screen.findByText('$0.10'));
    assert.ok(screen.getByText('$0.20'));
    assert.ok(screen.getByText('0.25×'));
    assert.ok((await screen.findAllByText('$10.00')).length >= 1);
    assert.ok(screen.getByText('90.0%'));
    // Practice score + checklist render from the same summary.
    assert.ok(screen.getByText('Practice score'));
    assert.ok(screen.getByText('Low retry waste'));
  });

  test('empty usage and spend logs show empty states', async () => {
    renderTab({ usage: null });
    assert.ok(await screen.findByText('No usage in this period'));
    assert.ok(screen.getByText('No model activity in this period'));
    assert.ok(await screen.findByText('No spend logs in this period'));
    // Langfuse placeholder never shows fake data.
    assert.ok(screen.getByText('Quality scores — connect Langfuse'));
  });

  test('opportunities sort non-ok signals first', async () => {
    renderTab();
    await screen.findByText('zzz-pricey');
    const body = document.body.textContent ?? '';
    assert.ok(
      body.indexOf('zzz-pricey') < body.indexOf('aaa-ok'),
      'flagged model must sort above the healthy one',
    );
    assert.ok(screen.getByText('Downgrade candidate'));
  });
});
