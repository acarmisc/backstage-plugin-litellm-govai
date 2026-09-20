import { describe, test } from 'node:test';
import assert from 'node:assert';
import {
  buildBudgetGauges,
  buildBudgetSummary,
  budgetHeadline,
  fmtBudgetDuration,
  budgetTone,
} from './budget';
import { UserInfo, TeamInfo, VirtualKey } from './types';

const user: UserInfo = {
  user_id: 'user:default/jane.doe',
  user_email: 'jane.doe@example.com',
  max_budget: 100,
  soft_limit: 80,
  spend: 46.14,
  budget_duration: '30d',
};

const team: TeamInfo = {
  team_id: 'team-platform-eng',
  team_alias: 'Platform Engineering',
  max_budget: 500,
  budget_duration: '30d',
  spend: 187.42,
};

const keys: VirtualKey[] = [
  { key: 'sk-a', key_alias: 'near', created_at: '2026-01-01', spend: 9.5, max_budget: 10 },
  { key: 'sk-b', key_alias: 'far', created_at: '2026-01-01', spend: 1, max_budget: 100 },
  { key: 'sk-c', key_alias: 'mid', created_at: '2026-01-01', spend: 40, max_budget: 50 },
  { key: 'sk-d', key_alias: 'unbounded', created_at: '2026-01-01', spend: 2 },
];

describe('buildBudgetSummary', () => {
  test('caps keys to the 3 closest to their budget, sorted by proximity', () => {
    const s = buildBudgetSummary(user, [team], keys);
    assert.strictEqual(s.keys.length, 3);
    assert.deepStrictEqual(
      s.keys.map(k => k.label),
      ['near', 'mid', 'far'],
    );
    assert.strictEqual(s.hiddenBudgetedKeys, 0);
    assert.strictEqual(s.totalKeyCount, 4);
  });

  test('reports keys hidden by the cap', () => {
    const s = buildBudgetSummary(user, [team], keys, 2);
    assert.strictEqual(s.keys.length, 2);
    assert.strictEqual(s.hiddenBudgetedKeys, 1);
  });

  test('only counts budgeted keys', () => {
    const s = buildBudgetSummary(user, [team], [keys[3], keys[0]]);
    assert.strictEqual(s.keys.length, 1);
    assert.strictEqual(s.hiddenBudgetedKeys, 0);
  });

  test('uses current_spend when present on the user', () => {
    const s = buildBudgetSummary({ ...user, spend: 0, current_spend: 50 }, [], []);
    assert.strictEqual(s.user?.spend, 50);
    assert.ok(Math.abs(s.user!.pct - 50) < 1e-9);
  });

  test('no user limit when no personal budget is set', () => {
    const s = buildBudgetSummary({ ...user, max_budget: undefined }, [], []);
    assert.strictEqual(s.user, undefined);
  });

  test('falls back to hard_limit as the user cap', () => {
    const s = buildBudgetSummary(
      { ...user, max_budget: undefined, hard_limit: 50, spend: 25 },
      [],
      [],
    );
    assert.strictEqual(s.user?.budget, 50);
    assert.strictEqual(s.user?.pct, 50);
  });

  test('skips teams without a budget', () => {
    const s = buildBudgetSummary(user, [{ ...team, max_budget: undefined }], []);
    assert.deepStrictEqual(s.teams, []);
  });

  test('sorts team limits by proximity', () => {
    const t2: TeamInfo = { team_id: 't2', team_alias: 'Tight', max_budget: 10, spend: 9 };
    const s = buildBudgetSummary(user, [team, t2], []);
    assert.deepStrictEqual(s.teams.map(t => t.label), ['Tight', 'Platform Engineering']);
  });

  test('keeps redacted teams as hidden limits with server pct', () => {
    const hidden: TeamInfo = {
      team_id: 't-hidden',
      team_alias: 'Secret',
      spend: 0,
      budget_hidden: true,
      budget_pct: 92,
      budget_status: 'near',
      budget_duration: '30d',
    };
    const s = buildBudgetSummary(user, [hidden], []);
    assert.strictEqual(s.teams.length, 1);
    assert.strictEqual(s.teams[0].hidden, true);
    assert.strictEqual(s.teams[0].pct, 92);
    assert.strictEqual(s.teams[0].budget, 0);
    assert.strictEqual(s.teams[0].spend, 0);
    assert.strictEqual(s.teams[0].budgetDuration, '30d');
  });

  test('hidden team limits still count toward the headline', () => {
    const hidden: TeamInfo = {
      team_id: 't-hidden',
      spend: 0,
      budget_hidden: true,
      budget_pct: 99,
      budget_status: 'near',
    };
    const h = budgetHeadline(
      buildBudgetSummary({ ...user, max_budget: undefined }, [hidden], []),
    );
    assert.strictEqual(h.count, 1);
    assert.strictEqual(h.closest?.kind, 'team');
    assert.strictEqual(h.closest?.hidden, true);
  });
});

describe('buildBudgetGauges', () => {
  test('returns exactly key, user, team in order', () => {
    const g = buildBudgetGauges(buildBudgetSummary(user, [team], keys));
    assert.deepStrictEqual(g.map(x => x.kind), ['key', 'user', 'team']);
  });

  test('each gauge is the limit of its level nearest the cap', () => {
    const g = buildBudgetGauges(buildBudgetSummary(user, [team], keys));
    assert.strictEqual(g[0].limit?.label, 'near');
    assert.strictEqual(g[1].limit?.label, 'Personal budget');
    assert.strictEqual(g[2].limit?.label, 'Platform Engineering');
  });

  test('key count includes keys hidden by the display cap', () => {
    const g = buildBudgetGauges(buildBudgetSummary(user, [team], keys, 1));
    assert.strictEqual(g[0].count, 3);
  });

  test('levels without a cap yield a gauge with no limit', () => {
    const g = buildBudgetGauges(
      buildBudgetSummary({ ...user, max_budget: undefined }, [], []),
    );
    assert.strictEqual(g[0].count, 0);
    assert.strictEqual(g[0].limit, undefined);
    assert.strictEqual(g[1].limit, undefined);
    assert.strictEqual(g[2].limit, undefined);
  });

  test('a hidden team limit still drives its gauge', () => {
    const hidden: TeamInfo = {
      team_id: 't-hidden',
      team_alias: 'Secret',
      spend: 0,
      budget_hidden: true,
      budget_pct: 92,
    };
    const g = buildBudgetGauges(
      buildBudgetSummary({ ...user, max_budget: undefined }, [hidden], []),
    );
    assert.strictEqual(g[2].count, 1);
    assert.strictEqual(g[2].limit?.pct, 92);
    assert.strictEqual(g[2].limit?.hidden, true);
  });
});

describe('budgetHeadline', () => {
  test('counts every concrete limit, including keys hidden by the cap', () => {
    const s = buildBudgetSummary(user, [team], keys, 2);
    const h = budgetHeadline(s);
    // 2 shown keys + 1 hidden key + personal budget + 1 team
    assert.strictEqual(h.count, 5);
  });

  test('closest is the highest meter across all levels, with its level', () => {
    const s = buildBudgetSummary(user, [team], keys);
    const h = budgetHeadline(s);
    // key "near" at 9.5/10 is the closest to its cap
    assert.strictEqual(h.closest?.kind, 'key');
    assert.strictEqual(h.closest?.label, 'near');
    assert.ok(Math.abs(h.closest!.pct - 95) < 1e-9);
  });

  test('closest can be the team budget when it is the tightest', () => {
    const tight: TeamInfo = { team_id: 't3', team_alias: 'Tight', max_budget: 10, spend: 9.9 };
    const h = budgetHeadline(buildBudgetSummary({ ...user, max_budget: undefined }, [tight], []));
    assert.strictEqual(h.closest?.kind, 'team');
    assert.ok(Math.abs(h.closest!.pct - 99) < 1e-9);
  });

  test('no limits -> count 0, closest null', () => {
    const s = buildBudgetSummary({ ...user, max_budget: undefined }, [], []);
    const h = budgetHeadline(s);
    assert.strictEqual(h.count, 0);
    assert.strictEqual(h.closest, null);
  });
});

describe('fmtBudgetDuration', () => {
  test('formats common windows', () => {
    assert.strictEqual(fmtBudgetDuration('30d'), 'every 30 days');
    assert.strictEqual(fmtBudgetDuration('1d'), 'daily');
    assert.strictEqual(fmtBudgetDuration('6h'), 'every 6 hours');
    assert.strictEqual(fmtBudgetDuration('1h'), 'hourly');
    assert.strictEqual(fmtBudgetDuration('20s'), 'every 20 seconds');
  });

  test('returns null / passthrough for edge inputs', () => {
    assert.strictEqual(fmtBudgetDuration(undefined), null);
    assert.strictEqual(fmtBudgetDuration(''), null);
    assert.strictEqual(fmtBudgetDuration('monthly'), 'monthly');
  });
});

describe('budgetTone', () => {
  test('danger when exhausted, warning when near', () => {
    assert.strictEqual(budgetTone(120), 'danger');
    assert.strictEqual(budgetTone(100), 'danger');
    assert.strictEqual(budgetTone(80), 'warning');
    assert.strictEqual(budgetTone(79.9), 'accent');
    assert.strictEqual(budgetTone(0), 'accent');
  });
});