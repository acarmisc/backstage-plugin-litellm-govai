import { UserInfo, TeamInfo, VirtualKey } from './types';
import { Tone } from './components/ui';

/** One concrete budget limit the signed-in user is subject to. */
export interface BudgetLimit {
  kind: 'key' | 'user' | 'team';
  /** Display name: key_alias / "Personal budget" / team_alias. */
  label: string;
  /** Secondary identifier: masked key, team_id, etc. */
  sublabel?: string;
  /** Spend cap in USD (> 0 when a cap exists). */
  budget: number;
  /** Spend so far in the current window. */
  spend: number;
  /** Reset window, e.g. "30d". Missing means the budget never resets. */
  budgetDuration?: string;
  /** User-facing warning threshold (soft limit). */
  softLimit?: number;
  /** Share of the cap spent, 0..100+ (unclamped). */
  pct: number;
}

/** The budgets that apply to the current user, grouped by enforcement level. */
export interface BudgetSummary {
  /** Budgeted keys, capped at `maxKeys`, closest to the cap first. */
  keys: BudgetLimit[];
  /** Budgeted keys hidden by the cap. */
  hiddenBudgetedKeys: number;
  /** Every key owned by the user (budgeted or not). */
  totalKeyCount: number;
  /** Personal budget, when one is set (undefined otherwise). */
  user?: BudgetLimit;
  /** Team budgets shared by the user's teams. */
  teams: BudgetLimit[];
}

/** Share of the cap spent, unclamped so 120% stays visible as such. */
function limitPct(spend: number, budget: number): number {
  if (budget <= 0) return 0;
  return (spend / budget) * 100;
}

/**
 * Collapses the current user's data into the budget limits that LiteLLM
 * actually enforces for them: key budgets (top `maxKeys`, closest to the cap
 * first), then the personal budget (when set), then each team budget. Team
 * budgets are enforced for every key bound to that team; a key *without* a
 * team falls back to the owner's personal budget.
 */
export function buildBudgetSummary(
  user: UserInfo | null,
  teams: TeamInfo[],
  keys: VirtualKey[],
  maxKeys = 3,
): BudgetSummary {
  const budgeted = keys
    .filter(k => (k.max_budget ?? 0) > 0)
    .map(k => {
      const spend = k.spend ?? 0;
      return {
        kind: 'key' as const,
        label: k.key_alias || k.key || 'Untitled key',
        sublabel: k.key,
        budget: k.max_budget!,
        spend,
        budgetDuration: k.budget_duration,
        pct: limitPct(spend, k.max_budget!),
      };
    })
    .sort((a, b) => b.pct - a.pct);

  const userBudget =
    user && (user.max_budget ?? user.hard_limit ?? 0) > 0
      ? (() => {
          const budget = user.max_budget ?? user.hard_limit ?? 0;
          const spend = user.current_spend ?? user.spend ?? 0;
          return {
            kind: 'user' as const,
            label: 'Personal budget',
            sublabel: user.user_email || user.user_id,
            budget,
            spend,
            budgetDuration: user.budget_duration,
            softLimit: user.soft_limit,
            pct: limitPct(spend, budget),
          };
        })()
      : undefined;

  const teamLimits: BudgetLimit[] = teams
    .filter(t => (t.max_budget ?? 0) > 0)
    .map(t => {
      const spend = t.spend ?? 0;
      return {
        kind: 'team' as const,
        label: t.team_alias || 'Untitled team',
        sublabel: t.team_id,
        budget: t.max_budget!,
        spend,
        budgetDuration: t.budget_duration,
        pct: limitPct(spend, t.max_budget!),
      };
    })
    .sort((a, b) => b.pct - a.pct);

  return {
    keys: budgeted.slice(0, maxKeys),
    hiddenBudgetedKeys: Math.max(0, budgeted.length - maxKeys),
    totalKeyCount: keys.length,
    user: userBudget,
    teams: teamLimits,
  };
}

/**
 * One-line summary of a `BudgetSummary`, for a collapsed/compact header:
 * how many concrete limits the user is subject to, and the one closest to
 * its cap — kept as the whole `BudgetLimit` so the caller can name its
 * level (key / personal / team). `closest` is null when there are no limits.
 */
export function budgetHeadline(summary: BudgetSummary): {
  count: number;
  closest: BudgetLimit | null;
} {
  const all: BudgetLimit[] = [
    ...summary.keys,
    ...(summary.user ? [summary.user] : []),
    ...summary.teams,
  ];
  const count =
    summary.keys.length +
    summary.hiddenBudgetedKeys +
    (summary.user ? 1 : 0) +
    summary.teams.length;
  const closest = all.length
    ? all.reduce((a, b) => (b.pct > a.pct ? b : a))
    : null;
  return { count, closest };
}

/** "30d" → "every 30 days"; "1d" → "daily". Returns null when duration is unset. */
export function fmtBudgetDuration(duration?: string): string | null {
  if (!duration) return null;
  const m = /^(\d+)(s|m|h|d)$/.exec(duration);
  if (!m) return duration;
  const n = Number(m[1]);
  const unit = m[2];
  if (unit === 'd') return n === 1 ? 'daily' : `every ${n} days`;
  if (unit === 'h') return n === 1 ? 'hourly' : `every ${n} hours`;
  if (unit === 'm') return n === 1 ? 'every minute' : `every ${n} minutes`;
  return n === 1 ? 'every second' : `every ${n} seconds`;
}

/** status pill tone + meter tone for a budget at `pct`. */
export function budgetTone(pct: number): Tone {
  if (pct >= 100) return 'danger';
  if (pct >= 80) return 'warning';
  return 'accent';
}