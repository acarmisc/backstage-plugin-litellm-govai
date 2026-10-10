import { Router, Request, Response } from 'express';
import { litellmTeamUsageReadPermission } from '@acarmisc/backstage-plugin-litellm-common';
import { LiteLLMUpstreamError } from '../client';
import { TeamInfo, UsageMetrics } from '../types';
import { isUserMemberOfGroup, ProvisioningError } from '../provisioning';
import { redactTeamUsage } from '../teamBudgetVisibility';
import {
  buildTeamMemberUsage,
  memberEmails,
  MemberProfiles,
  redactTeamMemberUsage,
} from '../teamMemberUsage';
import { sendError } from '../errors';
import { withTeamFetchRetry } from '../http/teamFetch';
import type { RouterContext } from './context';
import { createRequireUser, getProvisionedUser } from './middleware/withUser';

export function registerTeamUsageRoutes(router: Router, ctx: RouterContext): void {
  const {
    client,
    catalogClient,
    auth,
    logger,
    teamBudgetVisibility,
  } = ctx;
  const requireUser = createRequireUser(ctx);

  router.get('/teams/:teamId/usage', requireUser, async (req: Request, res: Response) => {
    try {
      const { teamId } = req.params;
      const { start_date, end_date } = req.query;
      if (!start_date || !end_date) {
        res.status(400).json({ error: 'start_date and end_date are required' });
        return;
      }

      // Authorize: member of the team OR a team manager
      const tokenEntityRef = res.locals.tokenEntityRef as string;

      const userInfo = await getProvisionedUser(ctx, res);

      // Check membership: user must be in the team OR be a team manager
      const isMember = userInfo?.teams?.includes(teamId) ?? false;
      // A "manager" administers this specific team: team management is enabled
      // and the caller belongs to the team's owning group (metadata.owning_group).
      // Membership of the global team-admin group alone is not enough.
      let isManager = false;
      // Skip the extra lookup when it can't change the outcome: members always
      // get through, and manager-ness only matters for members when the budget
      // hiding flags differ between the two roles.
      const managerCheckNeeded =
        ctx.teamMgmtEnabled &&
        (!isMember ||
          teamBudgetVisibility.hideTeamBudgetForMembers !==
            teamBudgetVisibility.hideTeamBudgetForManagers);
      if (managerCheckNeeded) {
        try {
          const team = await withTeamFetchRetry(() => client.getTeamInfo(teamId));
          const owningGroup =
            typeof team.metadata?.owning_group === 'string' ? team.metadata.owning_group : undefined;
          if (owningGroup) {
            isManager = await isUserMemberOfGroup(
              tokenEntityRef,
              owningGroup,
              catalogClient,
              auth,
              logger,
            );
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          logger.warn(`Team-manager check failed: ${message}`);
        }
      }

      if (!isMember && !isManager) {
        res.status(404).json({ error: 'Team not found' });
        return;
      }

      const usage: UsageMetrics = await client.getTeamUsage(
        teamId,
        start_date as string,
        end_date as string,
      );
      // Spend figures would let a client derive a hidden budget
      // (budget = spend / pct), so they follow the same hiding flags.
      // Which flag applies depends on whether the caller is a team manager;
      // catalog failures fail closed to the member rule.
      let hide = teamBudgetVisibility.hideTeamBudgetForMembers;
      if (isManager) {
        hide = teamBudgetVisibility.hideTeamBudgetForManagers;
      }
      res.json(hide ? redactTeamUsage(usage) : usage);
    } catch (error: unknown) {
      if (error instanceof ProvisioningError) {
        res.status(error.status).json(error.body);
        return;
      }
      sendError(res, error, logger, 'fetch team usage');
    }
  });

  // Per-member breakdown of a team's usage. Opt-in (404 when disabled) and
  // fail-closed: the caller must be a manager of the team (owning_group), or
  // a member who holds one of memberBreakdown.viewerRoles in the team or is
  // granted litellm.team.usage.read.
  router.get('/teams/:teamId/usage/members', requireUser, async (req: Request, res: Response) => {
    const cfg = ctx.memberBreakdownCfg;
    if (!cfg.enabled) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    try {
      const { teamId } = req.params;
      const { start_date, end_date } = req.query;
      if (!start_date || !end_date) {
        res.status(400).json({ error: 'start_date and end_date are required' });
        return;
      }

      const tokenEntityRef = res.locals.tokenEntityRef as string;
      const userInfo = await getProvisionedUser(ctx, res);
      const callerId = res.locals.userId as string;
      const isMember = userInfo?.teams?.includes(teamId) ?? false;

      let team: TeamInfo;
      try {
        team = await withTeamFetchRetry(() => client.getTeamInfo(teamId));
      } catch (err: unknown) {
        if (err instanceof LiteLLMUpstreamError && err.status === 404) {
          res.status(404).json({ error: 'Team not found' });
          return;
        }
        throw err;
      }

      const owningGroup =
        typeof team.metadata?.owning_group === 'string' ? team.metadata.owning_group : undefined;
      const isManager =
        ctx.teamMgmtEnabled &&
        !!owningGroup &&
        (await isUserMemberOfGroup(tokenEntityRef, owningGroup, catalogClient, auth, logger));

      if (!isMember && !isManager) {
        res.status(404).json({ error: 'Team not found' });
        return;
      }

      const role = team.members_with_roles?.find(m => m.user_id === callerId)?.role;
      const viaRole = isMember && !!role && cfg.viewerRoles.includes(role);
      const allowed =
        isManager ||
        viaRole ||
        (isMember &&
          cfg.permissionEnabled &&
          (await ctx.assertPermission(req, litellmTeamUsageReadPermission)));
      if (!allowed) {
        res.status(403).json({
          error: 'Access denied: viewing per-member usage needs a team role or permission',
        });
        return;
      }

      const [usage, keys] = await Promise.all([
        client.getTeamUsage(teamId, start_date as string, end_date as string),
        client.listTeamKeys(teamId),
      ]);
      const profiles = await lookupProfiles(memberEmails(team, keys));
      const breakdown = buildTeamMemberUsage(teamId, usage, keys, team, profiles);

      let via = 'permission';
      if (isManager) via = 'manager';
      else if (viaRole) via = 'teamRole';
      logger.info('team.usage.members.read', { actor: tokenEntityRef, teamId, via });

      const hide = isManager
        ? teamBudgetVisibility.hideTeamBudgetForManagers
        : teamBudgetVisibility.hideTeamBudgetForMembers;
      res.json(hide ? redactTeamMemberUsage(breakdown) : breakdown);
    } catch (error: unknown) {
      if (error instanceof ProvisioningError) {
        res.status(error.status).json(error.body);
        return;
      }
      sendError(res, error, logger, 'fetch team member usage');
    }
  });

  // Display names from catalog User entities with these emails. Best effort:
  // a catalog failure only drops the names.
  async function lookupProfiles(emails: string[]): Promise<MemberProfiles> {
    const profiles: MemberProfiles = new Map();
    if (!emails.length) return profiles;
    try {
      const { token } = await auth.getPluginRequestToken({
        onBehalfOf: await auth.getOwnServiceCredentials(),
        targetPluginId: 'catalog',
      });
      const { items } = await catalogClient.getEntities(
        {
          filter: { kind: 'User', 'spec.profile.email': emails },
          fields: ['spec.profile'],
        },
        { token },
      );
      for (const entity of items) {
        const profile = (entity.spec as any)?.profile ?? {};
        if (typeof profile.email === 'string') {
          profiles.set(profile.email.toLowerCase(), { displayName: profile.displayName });
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`Catalog lookup for team member names failed: ${message}`);
    }
    return profiles;
  }
}
