import { Config } from '@backstage/config';
import { TeamInfo, UsageMetrics } from './types';

/**
 * Independent "hide team budget" switches for the two team audiences.
 *
 * - `hideTeamBudgetForMembers` redacts dollar amounts on the member surface:
 *   `GET /teams`, the Teams cards, and the `TEAM` section of the budget widget.
 *   Members still see the consumption level (percent of cap + ok/near/over
 *   status + reset window).
 * - `hideTeamBudgetForManagers` does the same on the manager surface:
 *   `GET /teams/managed`, team write responses, and the ManageTeamDialog
 *   budget field (which becomes write-only).
 *
 * Both default to false (current behavior: dollars visible). Splitting them
 * lets an operator hide real budgets from regular members while team managers
 * keep the numbers they need to govern — or hide from both.
 */
export interface TeamBudgetVisibility {
  hideTeamBudgetForMembers: boolean;
  hideTeamBudgetForManagers: boolean;
}

/**
 * Consumption status derived from spend vs. cap. Mirrors the frontend
 * `budgetTone` thresholds (80% near, 100% over) so both sides agree.
 */
export type TeamBudgetStatus = 'ok' | 'near' | 'over';

export function teamBudgetStatusFor(
  spend: number,
  budget: number,
): TeamBudgetStatus {
  if (budget > 0 && spend >= budget) return 'over';
  if (budget > 0 && spend >= budget * 0.8) return 'near';
  return 'ok';
}

export function readTeamBudgetVisibility(
  config: Config,
): TeamBudgetVisibility {
  return {
    hideTeamBudgetForMembers:
      config.getOptionalBoolean(
        'litellm.display.hideTeamBudgetForMembers',
      ) ?? false,
    hideTeamBudgetForManagers:
      config.getOptionalBoolean(
        'litellm.display.hideTeamBudgetForManagers',
      ) ?? false,
  };
}

/**
 * Strips dollar amounts from a team record while preserving the consumption
 * signal. `max_budget` is dropped, `spend` is zeroed (the field is required
 * downstream, so it cannot be omitted — `budget_hidden: true` marks the
 * record as redacted), and `budget_pct` + `budget_status` carry the level of
 * consumption. `budget_duration`, models, members, and rate limits are kept:
 * none of them reveal dollars.
 *
 * Teams without a positive budget (unlimited) carry no dollars to hide and
 * are returned untouched.
 */
export function redactTeamBudget(team: TeamInfo): TeamInfo {
  const budget = team.max_budget ?? 0;
  if (budget <= 0) return team;
  const spend = team.spend ?? 0;
  const pct = Math.min(100, Math.max(0, (spend / budget) * 100));
  const { max_budget: _dropped, ...rest } = team;
  return {
    ...rest,
    spend: 0,
    budget_pct: pct,
    budget_status: teamBudgetStatusFor(spend, budget),
    budget_hidden: true,
  };
}

/**
 * Strips dollar amounts from team usage metrics while keeping the
 * non-monetary signal (tokens, requests). Returning zeroed spend (rather
 * than omitting the fields) keeps the response shape stable for existing
 * clients; the frontend hides spend charts whenever the owning team record
 * is redacted.
 */
export function redactTeamUsage(usage: UsageMetrics): UsageMetrics {
  const zeroSpend = <T extends { spend: number }>(p: T): T => ({
    ...p,
    spend: 0,
  });
  const zeroTotalSpend = <T extends { total_spend: number }>(p: T): T => ({
    ...p,
    total_spend: 0,
  });
  return {
    ...usage,
    total_spend: 0,
    usage_by_model: Object.fromEntries(
      Object.entries(usage.usage_by_model ?? {}).map(([k, v]) => [
        k,
        zeroTotalSpend(v),
      ]),
    ),
    usage_by_key: Object.fromEntries(
      Object.entries(usage.usage_by_key ?? {}).map(([k, v]) => [
        k,
        zeroTotalSpend(v),
      ]),
    ),
    daily_usage: (usage.daily_usage ?? []).map(zeroSpend),
    daily_by_model: (usage.daily_by_model ?? []).map(zeroSpend),
  };
}
