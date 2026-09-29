import { Response } from 'express';
import { TeamInfo } from '../types';
import { redactTeamBudget } from '../teamBudgetVisibility';
import type { RouterContext } from '../routes/context';

/**
 * Helper to respond with a team record, conditionally redacting its budget.
 *
 * `caller` indicates the role of the requester:
 * - 'member': person viewing from GET /teams (hides if hideTeamBudgetForMembers)
 * - 'manager': team admin viewing from GET /teams/managed or a write response (hides if hideTeamBudgetForManagers)
 */
export function respondTeam(
  res: Response,
  team: TeamInfo,
  ctx: RouterContext,
  caller: 'member' | 'manager',
): void {
  const shouldHide =
    caller === 'member'
      ? ctx.teamBudgetVisibility.hideTeamBudgetForMembers
      : ctx.teamBudgetVisibility.hideTeamBudgetForManagers;

  res.json(shouldHide ? redactTeamBudget(team) : team);
}

/**
 * Helper to respond with a list of teams, conditionally redacting budgets.
 */
export function respondTeamList(
  res: Response,
  teams: TeamInfo[],
  ctx: RouterContext,
  caller: 'member' | 'manager',
): void {
  const shouldHide =
    caller === 'member'
      ? ctx.teamBudgetVisibility.hideTeamBudgetForMembers
      : ctx.teamBudgetVisibility.hideTeamBudgetForManagers;

  res.json(shouldHide ? teams.map(redactTeamBudget) : teams);
}
