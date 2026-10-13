import type {
  InsightSummary,
  ModelInfo,
  ModelOpportunity,
  PracticeScore,
  UsageMetrics,
} from './types';

// Cost per 1k tokens for one model: price-list average when known,
// otherwise observed spend/tokens (both are $/token scaled to $/1k).
const costPer1k = (
  model: string,
  spend: number,
  tokens: number,
  models?: ModelInfo[],
): number | null => {
  const info = models?.find(m => m.model_name === model);
  const listed =
    info?.input_cost_per_token != null && info?.output_cost_per_token != null
      ? ((info.input_cost_per_token + info.output_cost_per_token) / 2) * 1000
      : null;
  if (listed !== null) return listed;
  return tokens > 0 ? (spend / tokens) * 1000 : null;
};

export const summarizeUsage = (
  usage: UsageMetrics | null,
  models?: ModelInfo[],
  premiumThresholdPer1k = 0.01,
): InsightSummary => {
  if (!usage) {
    return {
      costPer1kTokens: null, costPerRequest: null, outputInputRatio: null,
      retryWasteUsd: 0, retryWasteShare: 0, successRate: null,
      premiumShare: 0, premiumSpend: 0, topModelConcentration: 0,
      projectedMonthSpend: null, burnMultiple: null,
    };
  }
  const { total_spend: spend, total_tokens: tokens, prompt_tokens: prompt,
    completion_tokens: completion, api_requests: reqs,
    successful_requests: ok, failed_requests: failed, usage_by_model: byModel } = usage;
  // Failed requests still bill, so waste ~= spend share of failed requests.
  const wasteShare = reqs > 0 ? failed / reqs : 0;
  const entries = Object.entries(byModel ?? {});
  const topSpend = entries.reduce((m, [, d]) => Math.max(m, d.total_spend), 0);
  const premiumSpend = entries
    .filter(([name, d]) => (costPer1k(name, d.total_spend, d.total_tokens, models) ?? 0) > premiumThresholdPer1k)
    .reduce((s, [, d]) => s + d.total_spend, 0);
  const days = usage.daily_usage?.length ?? 0;
  const projected = days > 0 ? (spend / days) * 30 : null;
  return {
    costPer1kTokens: tokens > 0 ? (spend / tokens) * 1000 : null,
    costPerRequest: reqs > 0 ? spend / reqs : null,
    outputInputRatio: prompt > 0 ? completion / prompt : null,
    retryWasteUsd: spend * wasteShare,
    retryWasteShare: wasteShare,
    successRate: reqs > 0 ? ok / reqs : null,
    premiumShare: spend > 0 ? premiumSpend / spend : 0,
    premiumSpend,
    topModelConcentration: spend > 0 ? topSpend / spend : 0,
    projectedMonthSpend: projected,
    burnMultiple: projected !== null && spend > 0 ? projected / spend : null,
  };
};

export const scorePractices = (
  summary: InsightSummary,
  keyStats: { idleKeys: number; uncappedKeys: number; totalKeys: number },
): PracticeScore => {
  // Thresholds reward low waste, low premium concentration, diffuse model
  // mix, and capped/active keys; each check degrades in coarse bands.
  const waste = summary.retryWasteShare <= 0.01 ? 30 : summary.retryWasteShare <= 0.05 ? 20 : summary.retryWasteShare <= 0.1 ? 10 : 0;
  const premium = summary.premiumShare <= 0.2 ? 25 : summary.premiumShare <= 0.5 ? 15 : summary.premiumShare <= 0.8 ? 5 : 0;
  const conc = summary.topModelConcentration <= 0.5 ? 20 : summary.topModelConcentration <= 0.8 ? 10 : 0;
  const bad = keyStats.totalKeys > 0 ? (keyStats.idleKeys + keyStats.uncappedKeys) / keyStats.totalKeys : 0;
  const hygiene = keyStats.totalKeys === 0 ? 25 : bad === 0 ? 25 : bad <= 0.2 ? 15 : bad <= 0.5 ? 5 : 0;
  const checks: PracticeScore['checks'] = [
    { id: 'retry-waste', label: 'Low retry waste', points: waste, maxPoints: 30, detail: `${(summary.retryWasteShare * 100).toFixed(1)}% of requests failed` },
    { id: 'premium-mix', label: 'Balanced model mix', points: premium, maxPoints: 25, detail: `${(summary.premiumShare * 100).toFixed(1)}% of spend on premium models` },
    { id: 'concentration', label: 'No single-model lock-in', points: conc, maxPoints: 20, detail: `Top model is ${(summary.topModelConcentration * 100).toFixed(1)}% of spend` },
    { id: 'key-hygiene', label: 'Key hygiene', points: hygiene, maxPoints: 25, detail: `${keyStats.idleKeys} idle, ${keyStats.uncappedKeys} uncapped of ${keyStats.totalKeys} keys` },
  ];
  return { total: checks.reduce((s: number, c: { points: number }) => s + c.points, 0), checks };
};

export const modelOpportunities = (
  usage: UsageMetrics | null,
  models?: ModelInfo[],
  premiumThresholdPer1k = 0.01,
): ModelOpportunity[] => {
  if (!usage) return [];
  const entries = Object.entries(usage.usage_by_model ?? {});
  const overallRate = usage.api_requests > 0 ? usage.failed_requests / usage.api_requests : 0;
  return entries.map(([model, d]) => {
    const failureRate = d.api_requests > 0 ? d.failed_requests / d.api_requests : null;
    const avgCostPerRequest = d.api_requests > 0 ? d.total_spend / d.api_requests : 0;
    // Mostly-prompt traffic on a premium model is the classic downgrade signal.
    const completionShare = d.total_tokens > 0 ? d.completion_tokens / d.total_tokens : 0;
    const per1k = costPer1k(model, d.total_spend, d.total_tokens, models) ?? 0;
    const spendShare = usage.total_spend > 0 ? d.total_spend / usage.total_spend : 0;
    if (failureRate !== null && overallRate > 0 && failureRate > 2 * overallRate && d.api_requests >= 10) {
      return { model, spend: d.total_spend, requests: d.api_requests, failureRate, avgCostPerRequest, flag: 'failure-outlier' as const, hint: `Fails ${(failureRate * 100).toFixed(1)}% vs ${(overallRate * 100).toFixed(1)}% overall` };
    }
    if (per1k > premiumThresholdPer1k && completionShare < 0.3 && spendShare > 0.05) {
      return { model, spend: d.total_spend, requests: d.api_requests, failureRate, avgCostPerRequest, flag: 'downgrade-candidate' as const, hint: `$${per1k.toFixed(3)}/1k with ${(completionShare * 100).toFixed(0)}% output — try a cheaper model` };
    }
    return { model, spend: d.total_spend, requests: d.api_requests, failureRate, avgCostPerRequest, flag: 'ok' as const, hint: 'No action' };
  });
};
