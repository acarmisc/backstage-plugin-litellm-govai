import { Router, Request, Response } from 'express';
import { litellmTeamUsageReadPermission } from '@acarmisc/backstage-plugin-litellm-common';
import { LiteLLMUpstreamError } from '../client';
import { TeamInfo, UsageMetrics } from '../types';
import { isUserMemberOfGroup, ProvisioningError } from '../provisioning';
import { redactTeamUsage } from '../teamBudgetVisibility';
import {
  buildTeamKeyUsage,
  buildTeamMemberUsage,
  memberEmails,
  MemberProfiles,
  redactTeamKeyUsage,
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

  // A team manager: a member of the team's owning group (team management
  // enabled), or a member of the catalog lead group `<alias><leadGroupSuffix>`
  // for teams synced without an owning_group.
  async function isTeamManager(team: TeamInfo, tokenEntityRef: string): Promise<boolean> {
    const owningGroup =
      typeof team.metadata?.owning_group === 'string' ? team.metadata.owning_group : undefined;
    if (
      ctx.teamMgmtEnabled &&
      owningGroup &&
      (await isUserMemberOfGroup(tokenEntityRef, owningGroup, catalogClient, auth, logger))
    ) {
      return true;
    }
    const suffix = ctx.memberBreakdownCfg.leadGroupSuffix;
    if (!suffix || !team.team_alias) return false;
    // Same slug rule as the catalog group names: lower-case, other chars become '-'.
    const slug = team.team_alias.toLowerCase().replace(/[^a-z0-9\-_.]/g, '-');
    return isUserMemberOfGroup(
      tokenEntityRef,
      `group:default/${slug}${suffix}`,
      catalogClient,
      auth,
      logger,
    );
  }

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
      // A "manager" administers this specific team (see isTeamManager).
      // Membership of the global team-admin group alone is not enough.
      let isManager = false;
      // Skip the extra lookup when it can't change the outcome: members always
      // get through, and manager-ness only matters for members when the budget
      // hiding flags differ between the two roles.
      const managerCheckNeeded =
        (ctx.teamMgmtEnabled || !!ctx.memberBreakdownCfg.leadGroupSuffix) &&
        (!isMember ||
          teamBudgetVisibility.hideTeamBudgetForMembers !==
            teamBudgetVisibility.hideTeamBudgetForManagers);
      if (managerCheckNeeded) {
        try {
          const team = await withTeamFetchRetry(() => client.getTeamInfo(teamId));
          isManager = await isTeamManager(team, tokenEntityRef);
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

  // Shared gate of the per-member routes. Opt-in (404 when disabled) and
  // fail-closed: the caller must be a manager of the team (owning_group), or
  // a member who holds one of memberBreakdown.viewerRoles in the team or is
  // granted litellm.team.usage.read. Scoped to the one team in the path, so
  // leading a team never reveals another. Replies and returns null on refusal.
  async function authorizeMemberView(
    req: Request,
    res: Response,
  ): Promise<{
    teamId: string;
    team: TeamInfo;
    startDate: string;
    endDate: string;
    isManager: boolean;
    via: string;
  } | null> {
    const cfg = ctx.memberBreakdownCfg;
    if (!cfg.enabled) {
      res.status(404).json({ error: 'Not found' });
      return null;
    }
    const { teamId } = req.params;
    const { start_date, end_date } = req.query;
    if (!start_date || !end_date) {
      res.status(400).json({ error: 'start_date and end_date are required' });
      return null;
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
        return null;
      }
      throw err;
    }

    const isManager = await isTeamManager(team, tokenEntityRef);

    if (!isMember && !isManager) {
      res.status(404).json({ error: 'Team not found' });
      return null;
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
      return null;
    }

    let via = 'permission';
    if (isManager) via = 'manager';
    else if (viaRole) via = 'teamRole';
    return {
      teamId,
      team,
      startDate: start_date as string,
      endDate: end_date as string,
      isManager,
      via,
    };
  }

  const hideFor = (isManager: boolean): boolean =>
    isManager
      ? teamBudgetVisibility.hideTeamBudgetForManagers
      : teamBudgetVisibility.hideTeamBudgetForMembers;

  // Per-member breakdown of a team's usage.
  router.get('/teams/:teamId/usage/members', requireUser, async (req: Request, res: Response) => {
    try {
      const gate = await authorizeMemberView(req, res);
      if (!gate) return;
      const { teamId, team, startDate, endDate, isManager, via } = gate;

      const [usage, keys] = await Promise.all([
        client.getTeamUsage(teamId, startDate, endDate),
        client.listTeamKeys(teamId),
      ]);
      const profiles = await lookupProfiles(memberEmails(team, keys));
      const breakdown = buildTeamMemberUsage(teamId, usage, keys, team, profiles);

      logger.info('team.usage.members.read', {
        actor: res.locals.tokenEntityRef as string,
        teamId,
        via,
      });
      res.json(hideFor(isManager) ? redactTeamMemberUsage(breakdown) : breakdown);
    } catch (error: unknown) {
      if (error instanceof ProvisioningError) {
        res.status(error.status).json(error.body);
        return;
      }
      sendError(res, error, logger, 'fetch team member usage');
    }
  });

  // The team's keys (alias, owner, status, budget) with per-key usage, so a
  // team lead sees the members' keys and their consumption. Same gate and
  // redaction as the per-member breakdown.
  router.get('/teams/:teamId/usage/keys', requireUser, async (req: Request, res: Response) => {
    try {
      const gate = await authorizeMemberView(req, res);
      if (!gate) return;
      const { teamId, team, startDate, endDate, isManager, via } = gate;

      const [usage, keys] = await Promise.all([
        client.getTeamUsage(teamId, startDate, endDate),
        client.listTeamKeys(teamId),
      ]);
      const profiles = await lookupProfiles(memberEmails(team, keys));
      const keyUsage = buildTeamKeyUsage(teamId, usage, keys, team, profiles);

      logger.info('team.usage.keys.read', {
        actor: res.locals.tokenEntityRef as string,
        teamId,
        via,
      });
      res.json(hideFor(isManager) ? redactTeamKeyUsage(keyUsage) : keyUsage);
    } catch (error: unknown) {
      if (error instanceof ProvisioningError) {
        res.status(error.status).json(error.body);
        return;
      }
      sendError(res, error, logger, 'fetch team key usage');
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
